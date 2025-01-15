---
title: "Next.js에서의 대용량 파일 s3 업로드"
description: "Next.js에서 대용량 파일을 S3에 업로드하는 방법"
date: 2024-02-14
update: 2024-02-14
tags:
  - Next.js
  - AWS
---

현재 프로젝트에서 사용자가 챗봇 생성에 필요한 데이터를 업로드 하는 기능이 있다.
업로드를 구현하기 위해, 프론트엔드에서 AWS S3 SDK를 사용하여 업로드하기로 했다.

작은 파일의 경우는 [단일 객체 업로드](https://docs.aws.amazon.com/ko_kr/AmazonS3/latest/userguide/upload-objects.html)를 사용하여 업로드하면 간단하게 구현할 수 있다.

단일 객체 업로드의 경우 AWS 측에서 5GB 자료까지만 지원하며, 100MB 이상의 파일일 경우 멀티파트 업로드를 사용하도록 권하고 있다.

[멀티파트 업로드](https://docs.aws.amazon.com/ko_kr/AmazonS3/latest/userguide/mpuoverview.html)는 AWS S3에서 제공하는 파일 업로드 방식이다. 업로드할 파일을 작은 part로 나누어 각 부분을 개별적으로 업로드한다. 파일의 바이너리가 서버를 거치지 않고 S3에 다이렉트로 업로드되기 때문에 서버의 부하를 고려하지 않아도 된다는 장점이 있다.

![](https://velog.velcdn.com/images/ryanbae94/post/de27a517-8181-4e55-850b-5d7cbd6731bc/image.png)

만약 모든 part가 업로드 되었을 경우 AWS에서 하나의 객체로 조립하여 저장한다.
이 때, part별로 ETag라는 [MD5 Checksum](https://ko.wikipedia.org/wiki/MD5)을 활용하여 파일의 정합성을 확인한다.
또한, 파트가 업로드 되면 확인하고 사용자에게 업로드 진행상황을 제공할 수 있다.

![](https://velog.velcdn.com/images/ryanbae94/post/4af190fe-004d-447e-b438-156d8f6aae93/image.png)

멀티파트 업로드는 4단계 프로세스로 구성된다.

1. 멀티파트 업로드 시작
2. PresignedURL 발급
3. PresignedURL part 업로드 -> 클라이언트 사이드에서 업로드
4. 멀티파트 업로드 완료

---

### 백엔드 구현

백엔드 파트에는 3번을 제외한 3개의 엔드포인트가 있다.

- `POST api/s3-upload/get-id`
  이 엔드포인트의 목적은 서버가 멀티파트 업로드에 대한 고유 식별자인 `Upload Id`를 생성하는데 있다.
  부분 업로드, 업로드 완료 또는 업로드 중단 요청 시 항상 해당 식별자를 포함해야 하기 때문에 값을 잘 저장해 두어야 한다.

```TypeScript
import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

const Bucket = process.env.NEXT_PUBLIC_AWS_BUCKET_NAME as string;
const s3 = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY as string,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_KEY as string,
  },
});

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const command = new CreateMultipartUploadCommand({
      Bucket,
      Key: body.data.fileName,
      ContentType: body.data.fileType,
    });
    const result = await s3.send(command);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
  }
}

```

- `POST api/s3-upload/get-url`
  업로드를 위한 AWS의 서명된 URL을 발급받는 요청이다. 사전 서명된 URL을 사용하여 필요한 사람에게 세분화된 액세스 제어 및 강화된 보안을 갖춘 임시 액세스를 제공한다. `Upload ID`와 `PartNumber`값을 함께 요청해야 한다. AWS에서는 `Part Number`를 활용하여 업로드하는 객체의 각 부분과 그 위치를 고유하게 식별한다. 만약 이전에 업로드한 부분과 동일한 부분 번호로 새 부분을 업로드할 경우 이전에 업로드한 부분을 덮어쓰게 된다.

```
export async function POST(request: Request) {
  const body = await request.json();

  try {
    const command = new UploadPartCommand({
      Bucket,
      Key: body.data.fileName,
      PartNumber: body.data.partNumber,
      UploadId: body.data.uploadId,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return NextResponse.json(url);
  } catch (error) {
    console.error(error);
  }
}

```

- `POST api/s3-upload/get-complete`
  업로드가 완료되었음을 S3에 알리는 요청이다. `Upload Id`, 각 `PartNumber`와 매칭되는 `ETag`값이 배열로 포함되어야 한다. 업로드 완료가 수행되어야 S3에서는 `PartNumber`와 `ETag`를 기준으로 객체를 재조립한다.

```TypeScript
export async function POST(request: Request) {
  const body = await request.json();

  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket,
      Key: body.data.fileName,
      UploadId: body.data.uploadId,
      MultipartUpload: {
        Parts: body.data.parts,
      },
    });
    const result = await s3.send(command);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
  }
}
```

---

### 프론트엔드 구현

프론트엔드에서 처리해야할 단계는 5단계가 있다.

1. 파일을 파트(청크)로 나누기: `createChunkedArray()`
2. 멀티파트 업로드 ID 가져오기: `getIdForMultipartUpload()`
3. 각 파트에 대한 PresignedUrl 발급: `getUploadUrlForChunk()`
4. PresignedUrl로 업로드 요청 \* 청크 수 만큼
5. 모든 청크가 업로드 되었음을 서버에 알림: `closeMultipartUpload()`

`createChunkedArray()`
사용자가 선택한 파일의 청크 배열을 생성한다.
분할된 파트는 5MB ~ 5GB의 크기만 가능하지만, 마지막 파트는 5MB이하여도 괜찮다. 이와 같은 로직에서, 5MB이하의 단일 자료를 업로드 할 경우 첫 번째와 파트와 마지막 파트가 동일한 파트이기 때문에 멀티파트 업로드를 활용하는데 문제가 없다. 파트는 최대 5GB까지 10,000개를 업로드 할 수 있으니 (`PartNumber`값은 1부터 10,000까지 가능) 이론상 5TB 크기의 파일까지 업로드할 수 있다.

```TypeScript
export const createChunkedArray = async (
  file: File,
  chunkSize: number,
): Promise<Blob[]> => {
  const chunkedArray: Blob[] = [];
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    chunkedArray.push(chunk);
    offset += chunkSize;
  }

  return chunkedArray;
};
```

`getIdForMultipartUpload()`
파일 청크가 생성된 이후 파일에 대한 업로드를 알린다.

```TypeScript
export const getIdForMultipartUpload = async (
  fileName: string,
  fileType: string,
): Promise<string> => {
  try {
    const response = await axios.post('/api/s3-upload/get-id', {
      data: { fileName, fileType },
      action: 'get-id',
    });
    return response.data.UploadId;
  } catch (error) {
    console.error('Error obtaining upload ID:', error);
    throw error;
  }
};
```

`getUploadUrlForChunk()`
각 청크에 대한 Presigned Url 을 발급받는다.
이 로직은 이후 `createChunkedArray()`에서 생성된 청크 배열을 순회하며 각 청크에 대한 url을 발급받고, 각 url에 대한 업로드 요청을 수행한다.

```TypeScript
export const getUploadUrlForChunk = async (
  fileName: string,
  partNumber: number,
  uploadId: string,
): Promise<string> => {
  try {
    const response = await axios.post('/api/s3-upload/get-url', {
      data: {
        fileName,
        partNumber,
        uploadId,
      },
      action: 'get-url',
    });
    return response.data;
  } catch (error) {
    console.error('Error obtaining upload URL:', error);
    throw error;
  }
};
```

`closeMultipartUpload()`
`completedParts`와 `chunkedFile`의 배열의 길이가 동일하면 모든 청크가 전송된 것으로 간주하고 S3에 업로드 완료 요청을 발송한다.

```TypeScript
export const closeMultipartUpload = async (
  fileName: string,
  uploadId: string,
  completedParts: CompletedPartType[],
): Promise<object | void> => {
  try {
    await axios.post('/api/s3-upload/complete', {
      data: { fileName, uploadId, parts: completedParts },
      action: 'complete-upload',
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    throw error;
  }
};
```

`handleUpload()`
위에서 구현한 함수들을 사용하여 업로드를 수행하는 함수이다. 해당 코드가 컴포넌트에서 요청된다.

```TypeScript
export const handleUpload = async (
  file: File,
  setUploadProgress: React.Dispatch<React.SetStateAction<number>>,
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>,
  setIsUploaded: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> => {
  setIsUploading(true);
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  let uploadedChunk = 0; // progress를 추적하기 위한 변수
  try {
    const chunkedFile = await createChunkedArray(file, CHUNK_SIZE);
    const uploadId = await getIdForMultipartUpload(file.name, file.type);
    const uploadPromises = chunkedFile.map(async (chunk, index) => {
      const uploadUrl = await getUploadUrlForChunk(
        file.name,
        index + 1,
        uploadId,
      );
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: chunk,
        headers: {
          'Content-Type': file.type,
        },
      });
      uploadedChunk++;
      const progress = Math.ceil((uploadedChunk / chunkedFile.length) * 100);
      setUploadProgress(progress);
      if (!response.ok) throw new Error('Upload failed');
      return {
        ETag: response.headers.get('ETag') ?? '',
        PartNumber: index + 1,
      };
    });

    const completedParts: CompletedPartType[] =
      await Promise.all(uploadPromises);
    await closeMultipartUpload(file.name, uploadId, completedParts);
    setIsUploaded(true);
  } catch (error) {
    console.error('Upload error:', error);
    setIsUploaded(false);
  } finally {
    setIsUploading(false);
    setUploadProgress(0);
  }
};

```

컴포넌트에서의 사용 예시코드는 다음과 같다.

```TSX
import React, { useState } from 'react';
import { handleUpload } from '@/app/_lib/uploader';

export default function UploadFile() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);

  const onFileUpload = async (file: File) => {
    await handleUpload(file, setUploadProgress, setIsUploading, setIsUploaded);
  };
  return (
        {isUploading ? (
          <>
            <div>업로드 중입니다...</div>
            <div>{uploadProgress}%</div>
          </>
        ) : isUploaded ? (
          <div>업로드 완료!</div>
        ) : (
          <>
                <UploadButton onFileSelected={(file) => onFileUpload(file)} />

          </>
        )}

}
```

---

만약 최대 20MB정도의 이미지 업로드 기능을 개발하면서 멀티파트 업로드 방식으로 구현한다면 오버엔지니어링이라고 볼 수 있을 것이다. 본인의 프로젝트 요구사항에 따라서 타협적인 방식도 필요하다....

참고:
https://techblog.woowahan.com/11392/
https://docs.aws.amazon.com/ko_kr/AmazonS3/latest/userguide/Welcome.html
