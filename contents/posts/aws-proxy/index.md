---
title: "AWS Lambda + API GateWay 를 활용한 프록시 서버 구축하기 (feat. CORS)"
description: "서버리스 프록시 구축"
date: 2024-06-02
update: 2024-06-02
tags:
  - Next.js
  - AWS
---

서버 없이 클라이언트만으로 구축되어 있는 토이프로젝트를 진행하고 있습니다.

이 때, [네이버의 백과사전 API 기능](https://developers.naver.com/docs/serviceapi/search/encyclopedia/encyclopedia.md)을 활용하고 있는데, 서버 없이 클라이언트에서 바로 API 콜을 하게 되면 악명 높은 CORS 에러를 마주하게 됩니다.

잘 알려진 [cors-anywhere](https://www.npmjs.com/package/cors-anywhere)와 같은 기능을 사용할 수도 있지만, 이는 배포 환경에서는 동작하지 않고 근본적인 해결책이 아니기 때문에 [AWS Lambda](https://aws.amazon.com/ko/pm/lambda/?gclid=CjwKCAjwjeuyBhBuEiwAJ3vuobpr5p_mBIBNcK4wcUBnHwu8QkeZ9EAebp5q4iI5Tsm2bYeodXRlEBoC7A4QAvD_BwE&trk=b28d8305-f5fb-4858-9ae6-04a78cfcc154&sc_channel=ps&ef_id=CjwKCAjwjeuyBhBuEiwAJ3vuobpr5p_mBIBNcK4wcUBnHwu8QkeZ9EAebp5q4iI5Tsm2bYeodXRlEBoC7A4QAvD_BwE:G:s&s_kwcid=AL!4422!3!651510601848!e!!g!!aws%20lambda!19836398350!150095232634)를 활용한 서버리스 프록시 함수를 구현하기로 하였고, 해결 과정에 대해 매우 간단히 소개하려 합니다.

_이 글에서, naver api 사용에 대한 애플리케이션 설정은 완료했다고 가정합니다. 만약 설정하지 않았다면 본인이 사용할 기능에 대한 설정을 완료해주세요. _

# AWS Lambda 설정

#### 1. AWS 콘솔에서, AWS Lambda를 찾아갑니다.

#### 2. 함수 탭으로 이동 후 함수 생성 버튼을 클릭합니다.

![](https://velog.velcdn.com/images/ryanbae94/post/8e66b447-5fcd-4a78-b7e7-12f7f936c8be/image.png)

#### 3. 함수 이름을 적고 생성을 누릅니다.

![](https://velog.velcdn.com/images/ryanbae94/post/e8e90ac0-4927-4e51-8304-4a0f869a0417/image.png)

#### 4. 함수가 생성되면, 트리거 추가를 누릅니다.

![](https://velog.velcdn.com/images/ryanbae94/post/22b57c6f-1928-44b9-8bb3-c10b27095b77/image.png)

#### 5. API 게이트웨이 생성을 선택하고,

#### 의도: 새 API 생성,

#### API 유형: REST API,

#### 보안: 열기 를 선택합니다.

![](https://velog.velcdn.com/images/ryanbae94/post/bfa5e004-98a4-4a21-b600-0b87b692de22/image.png)

#### 6. API 엔드포인트가 생성됩니다.

![](https://velog.velcdn.com/images/ryanbae94/post/6e386164-e37c-4135-b759-f13d9b58253a/image.png)

#### 7. 환경 변수를 설정합니다.

7-1. 구성 탭의 환경변수 탭으로 들어갑니다
7-2. 편집을 클릭합니다.
![](https://velog.velcdn.com/images/ryanbae94/post/af694363-e110-4d2c-8497-f3b84c5a5920/image.png)
7-3. 네이버 개발자 센터에서 받아온 Client Id, Client Secret 값을 적어줍니다.
![](https://velog.velcdn.com/images/ryanbae94/post/95b4c69d-f075-4a87-8717-318d0c4d813a/image.png)

#### 8. 코드 탭으로 돌아가 서버 코드를 작성합니다.

![](https://velog.velcdn.com/images/ryanbae94/post/c199d276-b3e8-44c2-8022-46200189910c/image.png)

```javascript
import https from "https"

export const handler = async event => {
  const key = encodeURI(event.queryStringParameters.key)

  const options = {
    protocol: "https:",
    hostname: "openapi.naver.com",
    path: `/v1/search/encyc.json?query=${key}`,
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
    },
  }

  try {
    const result = await fetchNaverData(options)
    return formatResponse(200, result)
  } catch (error) {
    return formatResponse(500, { error: error.message })
  }
}

const fetchNaverData = options => {
  return new Promise((resolve, reject) => {
    https
      .get(options, response => {
        let result = ""

        response.on("data", chunk => {
          result += chunk
        })

        response.on("end", () => {
          try {
            resolve(JSON.parse(result))
          } catch (error) {
            reject(new Error("Failed to parse response"))
          }
        })

        response.on("error", error => {
          reject(new Error(error.message))
        })
      })
      .on("error", error => {
        reject(new Error(error.message))
      })
  })
}

const formatResponse = (statusCode, body) => {
  return {
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    statusCode: statusCode,
    body: JSON.stringify(body),
  }
}
```

#### 9. Deploy 버튼을 클릭합니다.

#### 10. API 게이트웨이를 클릭합니다.

![](https://velog.velcdn.com/images/ryanbae94/post/2cf61fa2-7879-4c11-821c-9b3b43426171/image.png)

#### 11. API 를 배포해줍니다.

![](https://velog.velcdn.com/images/ryanbae94/post/02dec2a1-c2b1-4e53-b362-05acd1fcf8cb/image.png)

#### 12. 클라이언트에서 api를 연결해줍니다.

```typescript
// 예시 코드
import axios from "axios"

export const client = axios.create({
  // AWS Lambda의 API 엔드포인트
  baseURL:
    "https://xw1t98pkkf.execute-api.ap-northeast-2.amazonaws.com/default/",
})

export const searchWord = async (word: string) => {
  try {
    const response = await client.get("/searchNaverDictionary", {
      params: {
        key: word,
      },
    })
    return response.data
  } catch (error) {
    console.error(error)
  }
}
```

---

# 서버 에러 확인

람다 함수 호출 시 서버 에러가 의심되는 경우, CloudWatch를 활용하여 로그를 확인해 볼 수 있습니다.
![](https://velog.velcdn.com/images/ryanbae94/post/9d61f4c9-b6c7-4be8-9b88-a63c91ab8c23/image.png)

---

# 타임아웃 세팅

간혹, 외부 api요청의 프록시 서버로 람다를 활용할 경우 외부 api 요청이 생각보다 길어지는 경우가 있습니다.
![](https://velog.velcdn.com/images/ryanbae94/post/987ad94b-a50d-43c0-b5cb-78f012e95617/image.png)
제 프로젝트의 경우도 간혹 이런 오류가 발생했는데, 여러 번 테스트해 본 결과 응답 시간이 3초가 지나면 자동으로 502 에러를 발생시키는 것으로 생각했습니다.

![](https://velog.velcdn.com/images/ryanbae94/post/12ede566-f589-4ad9-a985-e3c0cc1ded2f/image.png)

람다의 구성을 확인 해보면, 기본 값으로 3초의 타임아웃이 걸려있는 것을 확인할 수 있었는데요, 제 가설이 맞다고 생각을 했고, 타임아웃을 5초로 변경하였습니다.

![](https://velog.velcdn.com/images/ryanbae94/post/b2a8de02-c146-4864-8282-462329a76525/image.png)
변경 후, 3초 이상의 시간이 걸려도 더 이상 해당 버그가 발생하지 않는 것을 확인하였습니다.

이상으로 간단하게 서버리스 함수를 구현하는 법을 알아보았습니다.
아마 토이프로젝트에서 공공API 등을 활용할 때 자주 사용하게 될 것 같읍니다.
