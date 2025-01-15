---
title: "Next.js에서의 페이지 접근 제한(middleware)"
description: "Next.js에서 페이지 접근 제한을 구현하는 방법"
date: 2024-03-29
update: 2024-03-29
tags:
  - Next.js
---

# 1. 개요

프로젝트를 진행하면서, 로그인 상태에 따른 페이지 접근을 제한해야 하는 경우가 있습니다.
제가 진행하고 있는 프로젝트는 다음과 같은 서비스 플로우를 가지고 있습니다.

1.  로그인 상태가 아닐 경우 접근 제한: `/main-lobby`
2.  로그인 상태일 경우 접근 제한: `/sign-in` `/sign-up`

이 글에서는 Next.js 환경에서 어떻게 접근 제한을 구현하였는지에 대한 방법에 대해 공유하려고 합니다.

# 2. 시행착오

## 2.1. CSR

인증정보를 zustand 의 persist 기능을 활용하여 로컬스토리지에 담고 있었습니다.
`useEffect`훅을 사용하여 페이지 접근 시 로컬스토리지의 인증정보 유무를 확인하여 리다이렉트 하는 방법을 사용하였습니다.

```jsx
// BAD CODE

export default function SignUp() {
  const { isLogin } = useAuthStore();
  const router = useRouter();

 useEffect(() => {
 	if (isLogin) {
    	router.push('/main-lobby')
    }
 })

  return(
  	//...
  )
}

```

이 방법대로 처리하게 되면 실제 페이지에 접근 후 리다이렉트 되기 때문에 화면상에 해당 페이지가 잠깐 사용자에게 노출이 된다는 문제가 있었습니다.
![](https://velog.velcdn.com/images/ryanbae94/post/b4a8cc76-13f3-43ca-baee-4bf75d818f66/image.gif)

위 방식대로 처리할 경우 발생하는 문제점은 다음과 같습니다.

1. 사용자 경험
2. 실제 페이지에 접근한 후 이동하기 때문에, 해당 페이지에서 호출되는 api도 실행됨. 리소스 낭비

`useLayoutEffect` 훅과 같이 페이지가 페인트되기 전에 실행하는 기능을 사용해볼 수 있지만 이는 2번의 문제를 해결할 수 없고 [React 공식문서](https://react-ko.dev/reference/react/useLayoutEffect) 에서도 가급적 사용을 피하라고 명시되어 있기에 제외하였습니다.

# 3. SSR

## 3.1. middleware

따라서 서버사이드렌더링 (SSR) 시점에서 로그인 상태를 판단하고 리다이렉트 처리를 해야 했습니다. SSR단계에서 로그인 상태를 확인하면 페이지를 받기 전에 처리가 완료되기 때문에 불필요한 페이지 호출이 발생하지 않습니다.

이 문제를 해결하기 위해 Next.js의 [middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)를 사용했습니다.
middleware는 요청이 완료되기 전에 코드를 실행할 수 있게 해주는 기능입니다. 이를 통해 서버 사이드에서 요청을 가로채거나 수정할 수 있으며, 보안 검사, 리디렉션, 사용자 인증 등의 목적으로 활용할 수 있습니다.

### 3.1.1. middleware 구현

미들웨어를 사용하기 위해서는 앱의 루트폴더에 `middleware.ts(js)`를 작성해줍니다. 저는 App router를 활용 중이기 때문에, `src/app/` 아래에 작성해주었습니다.

#### **Config**

```ts
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts|images).*)"],
}
```

middleware는 기본적으로 라우터의 모든 경로에 적용됩니다. static 폴더와 같이 적용될 필요가 없는 부분을 뺀 모든 경로에 적용하도록 정규식을 작성해주었습니다.

#### **url config**

```ts
const url = request.nextUrl.clone()
url.pathname = "/sign-in"
return NextResponse.redirect(url)
```

### 3.1.2. Cookie 사용

```ts
const token = request.cookies.get("accessToken")
```

middleware는 로컬스토리지에 접근할 수 없습니다. middleware는 서버측에서 작동하는 코드인데, 로컬스토리지는 오직 브라우저(클라이언트) 측에서만 접근할 수 있는 [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)이기 때문입니다.
따라서 인증 정보를 저장하는 방식을 로컬스토리지에서 cookie로 변경하였습니다.

# 4. 전체 코드 및 수정 결과

```ts
import { NextRequest, NextResponse } from "next/server"

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts|images).*)"],
}

const protectedRoutes = ["/main-lobby"] // 로그인 정보가 있어야만 접근할 수 있는 페이지
const publicRoutes = ["/sign-in", "/sign-up"]
// 로그인 하지 않을 경우 접근할 수 있는 페이지

export function middleware(request: NextRequest) {
  const token = request.cookies.get("accessToken")
  const currentPath = request.nextUrl.pathname
  console.log(token)

  if (!token && protectedRoutes.includes(currentPath)) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    return NextResponse.redirect(url)
  }

  if (token && publicRoutes.includes(currentPath)) {
    const url = request.nextUrl.clone()
    url.pathname = "/main-lobby"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}
```

로그인 상태에서 sign-in, sign-up 페이지 접근 시
![](https://velog.velcdn.com/images/ryanbae94/post/2fe1661c-8a86-4a27-98d4-de83b0e2e19c/image.gif)

의도대로 잘 작동합니다.
서버사이드에서의 페이지 로딩을 통해 리소스 낭비를 줄일 수 있었습니다.

# 5. 기타

## 인증토큰 저장방식

토큰을 저장하는 방식을 로컬스토리지에서 쿠키로 변경하였는데, 이 때 발생할 문제점은 없을까요?

다음은 로컬스토리지와 쿠키, 그리고 클라이언트 메모리에 토큰을 저장했을 때의 장단점을 비교한 표입니다.

| 특성         | localStorage                        | Cookies                                   | 로컬 메모리                |
| ------------ | ----------------------------------- | ----------------------------------------- | -------------------------- |
| 접근방법     | JS를 통해 접근 가능                 | HTTP 헤더 및 JS로 접근 가능               | JS를 통해 접근 가능        |
| 보안취약성   | XSS 공격에 취약                     | HttpOnly옵션으로 JS 접근 방지 가능        | XSS 공격에 취약            |
| 전송보안     | 클라이언트 사이드에서만 관리        | Secure 옵션 사용 시 HTTPS를 통해서만 전송 | 서버로 자동 전송 안됨      |
| CSRF         | 안전; JS코드에 의해 헤더에 담김     | SameSite 옵션으로 방지 가능               | 안전                       |
| 라이프사이클 | 영구적 (직접 삭제하기 전 까지 유지) | 설정 가능                                 | 탭 / 브라우저 종료 시 휘발 |
| 사용사례     | 장기 저장 데이터 (설정 등)          | 인증 토큰(RefreshToken), 세션 관리        | 임시 인증 정보             |

**_RefreshToken_**을 쿠키에 담고, **_AccessToken_**을 로컬 메모리에 담으면 공격자의 보호에 안전할 수 있습니다. 왜냐하면 공격자가 CSRF를 통해 **_RefreshToken_**을 탈취하더라도 실제 **_AccessToken_**에 접근할 수 없기 때문입니다.

로컬스토리지와 클라이언트 메모리 모두 XSS공격에는 취약하지만, 클라이언트 메모리가 상대적으로 더 안전합니다. 공격자가 사용자의 세션에 스크립트를 직접 주입하지 않는 이상, 메모리에 접근하기가 어렵기 때문입니다.

사용자가 화면을 새로고침 하는 등의 행위로 인해 **_AccessToken_**이 휘발되는 경우에는 쿠키의 **_RefreshToken_**을 통해 자동으로 재발급하는 로직을 구현하면 해결됩니다.

따라서, 쿠키에 **_RefreshToken_**을 저장하는 방식을 선택하셨을 경우 **_AccessToken_**을 저장하는 방식은 프로젝트가 보안성을 추구하는지, 사용성(라이프사이클, 재인증 로직의 구현 복잡성 등)을 추구하는지에 따라서 선택하면 됩니다.

저는 결과적으로 쿠키에 **_RefreshToken_**을 저장하고, zustand를 활용하여 전역상태에 **_AccessToken_**을 저장하는 방식을 선택하였습니다.
