---
title: "Next.js에서 발생하는 소켓과 클로저 이슈"
description: "Next.js에서 발생하는 소켓과 클로저 이슈"
date: 2024-08-20
update: 2024-08-20
tags:
  - Next.js
  - 소켓
---

## 서론

서로 다른 기술들을 활용하다보면, 기술들의 원리를 정확히 이해하지 못해 발생하게 되는 이슈가 종종 있습니다. 저는 Next.js 환경에서 소켓을 활용하면서 소켓과 클라이언트의 상태가 동기화되지 않던 문제를 마주쳤는데요, 결론부터 말하자면 이 이슈는 클로저 문제였습니다.

처음 문제를 마주쳤을 때, `Next.js`와 `소켓` 키워드를 연결해 검색을 해보았는데, 해결방법을 전혀 찾지 못했습니다. 몇 시간을 헤매다가 자바스크립트의 기본서와 React의 렌더링 원리를 다시 참고해 보았는데, 여기서 힌트를 얻어 문제를 해결할 수 있었습니다.

제가 다루었던 프로젝트 코드를 공유하기에는 너무 코드가 길고 복잡해서, 예시 코드를 작성하여 이슈를 해결했던 과정을 공유하려고 합니다.

## JavaScript 클로저의 동작 원리

클로저 문제를 제대로 이해하기 위해서는 먼저 JavaScript의 클로저가 어떻게 동작하는지 이해해야 합니다.

```javascript
function createCounter() {
  let count = 0 // 외부 렉시컬 환경의 변수

  return function () {
    // 내부 함수가 외부 변수를 참조
    return count++ // 클로저 형성
  }
}

const counter = createCounter()
console.log(counter()) // 0
console.log(counter()) // 1
```

클로저는 다음과 같은 특징을 가집니다.

1. 내부 함수가 외부 함수의 변수에 접근할 수 있습니다
2. 외부 함수가 반환된 후에도 내부 함수는 외부 변수를 계속 참조할 수 있습니다
3. 클로저가 캡처한 변수는 최초 생성 시점의 값을 유지합니다

## React의 렌더링과 클로저

React의 렌더링 사이클에서 클로저가 어떻게 동작하는지 살펴보겠습니다.

```javascript
function ExampleComponent() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      console.log("Current count:", count)
      setCount(count + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return <div>{count}</div>
}
```

이 코드에서 발생하는 현상을 단계별로 분석해보겠습니다:

1. **초기 렌더링**

   - 컴포넌트가 마운트됩니다
   - `count`는 0으로 초기화됩니다
   - `useEffect` 내부의 클로저가 `count = 0`을 캡처합니다

2. **타이머 동작**

   - 1초마다 setInterval 콜백이 실행됩니다
   - 클로저는 캡처된 `count = 0`을 계속 참조합니다
   - `setCount(0 + 1)`이 반복적으로 실행됩니다

3. **예상과 다른 결과**
   - 예상: 0, 1, 2, 3, 4, ...
   - 실제: 0, 1, 1, 1, 1, ...

## 소켓의 동작원리와 클로저 문제 발생 원인

그렇다면 컴포넌트 내에서 메세지 기반의 소켓을 활용하고, 소켓의 데이터를 상태로 관리하는 경우는 어떨까요?

```javascript
function ProblematicChatRoom() {
  const [users, setUsers] = useState([]);
  const [activeRoom, setActiveRoom] = useState('general');

  useEffect(() => {
    const socket = io('http://localhost:3000');

    // 문제 1: 클로저로 인해 이전 activeRoom 값을 참조
    socket.on('user_joined', (newUser) => {
      // activeRoom이 변경되어도 여기서는 최초 값('general')만 참조
      if (newUser.room === activeRoom) {
        setUsers(users => [...users, newUser]); // 이전 users 배열을 참조
      }
    });

    return () => socket.disconnect();
  }, [activeRoom]);

```

### 클로저로 인한 상태 참조 문제

```javascript
socket.on("user_joined", newUser => {
  if (newUser.room === activeRoom) {
    // 오래된 activeRoom 값 참조
    setUsers(users => [...users, newUser])
  }
})
```

이벤트 핸들러가 생성될 때의 `activeRoom` 값을 클로저로 캡처하여, 이후 방이 변경되어도 최초의 값만 참조하게 됩니다.

이러한 동기화 문제가 발생하는 근본적인 원인은 다음과 같습니다.

1. 소켓의 이벤트 리스너는 등록 시점의 클로저를 유지합니다.
2. React의 상태 업데이트는 비동기적으로 처리됩니다.
3. 소켓 이벤트는 React의 렌더링 사이클과 독립적으로 발생합니다.

## 해결 방법

### useRef를 활용한 해결

useRef의 주요 특징을 활용하여 이전 상태를 참조하는 문제를 해결할 수 있습니다.

- 렌더링 사이에도 값이 유지됩니다
- .current 속성의 변경은 리렌더링을 트리거하지 않습니다
- 동기적으로 값을 읽고 쓸 수 있습니다

```javascript
const activeRoomRef = useRef(activeRoom)
useEffect(() => {
  activeRoomRef.current = activeRoom
}, [activeRoom])
```
