---
title: "모바일 환경에서의 클릭, 터치 이벤트 처리"
description: "토이프로젝트에서 만난 크로스브라우징 이슈 핸들링 경험"
date: 2023-12-31
update: 2023-12-31
tags:
  - 크로스브라우징
---

토이프로젝트로 WORDLE 게임을 만들었다.

[게임링크](https://ryanbae94.github.io/wordle/), [소스코드링크](https://github.com/ryanbae94/wordle)

데스크탑 브라우저 환경에서는 잘 동작하지만, 내 핸드폰 브라우저 환경(iOS, Safari)에서는 버튼을 빠르게 눌렀을 경우, 예를들어 'P','O'를 빠르게 입력할 경우 'PO' 대신 'PP'가 입력되는 경우가 발생했다.

![](https://velog.velcdn.com/images/ryanbae94/post/e94c12e8-c3b6-4236-a5be-c6a04032eeb4/image.gif)

처음에는 이 오류가 발생하는 원인을 데스크탑 환경과 모바일 환경의 브라우저 렌더링 성능 차이 때문이라고 생각했다.
따라서 상태 업데이트 로직을 살펴보았고 비효율적인 부분의 개선을 시도했다.

## 1. 상태 업데이트 로직의 비효율성

원래코드:

```tsx
const [cellValues, setCellValues] = useState<
  { letter: string; color: string }[][]
>(
  Array(6)
    .fill(null)
    .map(() => Array(5).fill({ letter: "", color: "" }))
)

const handleKeyPress = (key: string) => {
  // 기타 코드 생략

  {
    setCellValues(prev => {
      const newValues = prev.map(row => row.map(cell => ({ ...cell })))
      if (currentColumn < 5) {
        newValues[currentRow][currentColumn].letter = key
        setCurrentColumn(Math.min(currentColumn + 1, 5))
        setGuess(guess + key)
      }
      return newValues
    })
  }
}
```

위 코드를 살펴보면, 게임보드의 그리드를 2차원 배열로 생성하였고, 키가 입력되면 2차원 배열에 key값을 letter에 담아두는 형식으로 상태를 선언했다.

키 값이 입력되었을 때 상태변화를 발생시키는 로직인 `handleKeyPress()`를 보면, `newValues`를 깊은 복사를 통해 전체 2차원 배열을 복사하고, 입력된 key값을 담은 후 상태를 업데이트 하고 있다.

하지만 실제로 변경이 필요한 것은 key값이 입력되고 있는 현재 행의 현재 열에 해당하는 셀 뿐이다. 전체 그리드를 복사하는 대신 변경이 필요한 부분만 복사하고 업데이트 하는 것이 효율적이기 때문에 코드를 수정하였다.

수정된 코드:

```tsx
// 이전 코드 생략
setCellValues((prev) => {
  const newValues = [...prev];
  if (currentColumn < 5) {
    const newRow = [...newValues[currentRow]];
    newRow[currentColumn] = { letter: key, color: '' };
    newValues[currentRow] = newRow;
    setGuess(guess + key);
    setCurrentColumn(Math.min(currentColumn + 1, 5));
  }
  return newValues;
```

코드를 수정했음에도 여전히 같은 오류가 발생했다.

사실 브라우저와 모바일의 렌더링 성능차이가 난다고 하더라도, 겨우 6\*5 배열 수준인데 입력 지연이 발생할 정도로 성능 차이가 난다는 것은 말이 안되긴 했다....

## 2. iOS환경에서의 클릭 지연

![](https://velog.velcdn.com/images/ryanbae94/post/04794919-e987-4539-aa82-7a17e1913182/image.png)
원본기사: https://www.telerik.com/blogs/what-exactly-is.....-the-300ms-click-delay

iOS환경의 브라우저에서는 더블탭, 스와이프를 감지하기 위해 의도적으로 300ms의 클릭 딜레이를 준다는 기사를 찾게 되었다!

버튼 클릭 이벤트에 사용하는 `onClick()`을 사용할 경우 클릭 딜레이가 발생하게 되는 것이었고, 터치 이벤트를 활용하면 클릭 딜레이가 발생하지 않기 때문에 `onTouchEnd()`를 활용해 보았다.

```tsx
const [touchUsed, setTouchUsed] = useState(false)

const handleClick = (key: string) => {
  if (!touchUsed) {
    onKeyPress(key)
  }
  setTouchUsed(false)
}

const handleTouch = (key: string) => {
  setTouchUsed(true)
  onKeyPress(key)
}

// 기타코드 생략
return (
  <button
    key={key}
    onClick={() => handleClick(key)}
    onTouchEnd={() => handleTouch(key)}
    className={className}
  >
    {key}
  </button>
)
```

데스크탑 환경에서는`onClick()`을 사용하고 모바일 환경에서는`onTouchEnd()`를 사용해야 했기 때문에, 터치 상태를 만들고 터치일 경우에만(모바일 브라우저일 경우에만) `onTouchEnd()`를 사용할 수 있게 구현하였다.

만약 상태를 쓰지 않을 경우 모바일에서 버튼을 누르면 `onClick()`과 `onTouchEnd()`가 연달아 호출되어 key가 두 번 입력되게 된다.

그리고 결과는...![](https://velog.velcdn.com/images/ryanbae94/post/46d6e046-0db9-4011-a2cd-5c9e23a13712/image.gif)
잘 동작한다!

단순히 친구들과 즐기기 위해 만든 토이프로젝트였지만, 예상치 못한 크로스브라우징 이슈를 만나게 되었다. 앞으로의 프로젝트에서는 여러 환경에서의 작동을 고려하여 개발해야겠다.
