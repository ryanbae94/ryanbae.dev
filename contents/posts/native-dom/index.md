---
title: "Native DOM은 진짜 느려요?"
description: "Native DOM과 브라우저 DOM의 차이점"
date: 2025-01-15
update: 2025-01-15
tags:
  - 브라우저
---

"DOM 조작은 느려요" 라는 말은, 프론트엔드 개발자 사이에서는 당연한 것처럼 받아들여지고 있습니다. 이러한 인식 때문에 React와 같은 Virtual DOM 기반 라이브러리 / 프레임워크들이 등장했고, 이 신기술들을 채택하는 주요 근거로 활용되기도 합니다.

하지만, Virtual DOM도 결국 Native DOM에서 파생된 것일텐데, 어떻게 Native DOM이 더 느릴까? 하는 의문이 생겨서, 아주 간단한 실험을 해보았습니다.

---

## 실험 설계

다음 두 가지 방식의 실험을 진행해 볼 겁니다.

1. `createElement` + `appendChild`를 활용한 직접 DOM 조작
2. `DocumentFragement`를 활용한 일괄 처리 (repaint 최소화를 위함)

다만, 이 실험을 할 때 고려해야할 점이 몇 가지 있습니다.

현대의 브라우저는 화면을 그릴 때, 생각보다 최적화가 잘 되어 있습니다. 무식하게 많은 요소를 쌓을 때에도, 내부적으로 최적화를 수행하여 reflow/repaint를 최소화합니다.

그렇기 때문에, 저는 다음과 같은 트릭을 활용하여 제가 의도하는 바를 명확하게 실험해볼 수 있도록 할겁니다.

1. DOM 조작 시 추가되는 요소들의 높이를 지정하고, 스타일의 변화를 주어 브라우저가 각 요소마다 스타일을 계산하도록 강제함
2. 각 요소가 추가될 때 마다 `offsetHeight`에 접근하여 reflow 강제함
3. 요소 처리 후 `requestAnimationFrame`을 활용하여 DOM 업데이트가 완료된 시점을 정확히 캐치

또한, 보다 정확한 수치 도출을 위해 각 테스트를 5번씩 돌리고, 이에 대한 평균값을 구할 것입니다.
이 때, 각 테스트 사이에는 약간의 간격을 주어 각 테스트가 비워질 때 쌓이는 가비지 컬렉터의 영향을 최소화 하였습니다.

간단한 실험임에도, 고려해야할 사항이 정말 많네요.

실험에 사용될 코드는 다음과 같습니다.

1. `createElement` + `appendChild`를 활용한 직접 DOM 조작

```javascript
const testDOM = (count) => {
	return new Promise((resolve) => {
		const container = document.querySelector('.dom-container');
		container.innerHTML = '';

		for (let i = 0; i < count; i++) {
			const div = document.createElement('div');
			div.innerHTML = `number ${i}`;
			div.style.height = '20px';
			div.style.backgroundColor = i % 2 ? '#f0f0f0' : '#fff';
			container.appendChild(div);
			div.offsetHeight; // 강제로 리플로우 발생
		}

		// 실제 DOM 업데이트 완료를 기다림
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				resolve();
			});
		});
	});
};
};
```

2. `DocumentFragement`를 활용한 일괄 처리

```javascript
const testDocumentFragment = (count) => {
	return new Promise((resolve) => {
		const container = document.querySelector('.dom-container-fragment');
		container.innerHTML = '';

		const fragment = document.createDocumentFragment();
		for (let i = 0; i < count; i++) {
			const div = document.createElement('div');
			div.innerHTML = `number ${i}`;
			div.style.height = '20px';
			div.style.backgroundColor = i % 2 ? '#f0f0f0' : '#fff';
			fragment.appendChild(div);
		}
		container.appendChild(fragment);

		// 실제 DOM 업데이트 완료를 기다림
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				resolve();
			});
		});
	});
};
};

```

3. 테스트 실행 코드

```javascript
const runTest = (testFn, count, iterations = 5) => {
  const times = []

  const runIteration = () => {
    const startTime = performance.now()
    testFn(count).then(() => {
      const endTime = performance.now()
      times.push(Number((endTime - startTime).toFixed(2)))

      if (times.length === iterations) {
        const average = (times.reduce((a, b) => a + b, 0) / iterations).toFixed(
          2
        )
        const result = document.getElementById(
          testFn === testDOM ? "result" : "result-fragment"
        )
        result.innerHTML = `Average time (${iterations} runs): ${average}ms<br>
								  All times: ${times.join("ms, ")}ms`
      } else {
        setTimeout(() => runIteration(), 100)
      }
    })
  }

  runIteration()
}
```

---

## Native DOM 실험

요소를 100개, 1000개, 5000개 순으로 쌓아보겠습니다.

![](https://velog.velcdn.com/images/ryanbae94/post/084d1e9c-298a-46c0-b289-e8444a42704e/image.png)

![](https://velog.velcdn.com/images/ryanbae94/post/5c249d06-12e9-4ccf-8350-564da39a258a/image.png)

![](https://velog.velcdn.com/images/ryanbae94/post/7096207b-9a9e-4bb1-9150-9a622c727038/image.png)

이 결과를 표로 정리하면 다음과 같습니다.

| 요소의 갯수 | 직접 삽입 방식 | Document Fragment 방식 |
| ----------- | -------------- | ---------------------- |
| 100         | 10.48ms        | 7.86ms                 |
| 1000        | 98.04ms        | 15.44ms                |
| 5000        | 1898.08ms      | 47.98ms                |

확연한 차이가 보이네요. 두 방식 모두 요소의 갯수에 따라 작업 시간이 비례하지만, 직접 삽입 방식은 기하급수적으로 상승하는게 눈에 보입니다.

이 결과를 통해, DOM 처리의 속도에 영향을 주는 것은 단순한 요소의 추가가 아니라 reflow/repaint 과정 때문임을 알 수 있습니다.

또한, 많은 요소들을 쌓아야 하는 경우가 있다면 reflow를 최소화하는 document Fragment를 활용하는 것이 유의미한 효과가 있다고 할 수 있겠네요.

---

## Virtual DOM 실험

그렇다면, Virtual DOM을 활용하면 얼마나 빠르게 작업을 완료할 수 있을까요?
React를 활용해 같은 방식의 실험을 해보았습니다.

React의 경우 첫 렌더링에는 컴포넌트 초기화가 발생하기 때문에, 이 과정을 제외시키기 위해 6번 반복 후 첫 번째 테스트 결과는 제외하였습니다.

```jsx
const [times, setTimes] = useState([])
const [virtualDomItems, setVirtualDomItems] = useState([])
const [count, setCount] = useState(0)
const [isRunning, setIsRunning] = useState(false)
const startTimeRef = useRef(0)
const iterationRef = useRef(0)
const newTimesRef = useRef([])

// DOM 업데이트 완료를 감지하는 useEffect
useEffect(() => {
  if (!isRunning) return

  // 실제 DOM 업데이트가 완료된 후 시간 측정
  requestAnimationFrame(() => {
    const endTime = performance.now()
    const time = (endTime - startTimeRef.current).toFixed(2)
    newTimesRef.current.push(Number(time))

    if (newTimesRef.current.length === 6) {
      // 6번 실행
      setTimes(newTimesRef.current.slice(1)) // 첫 번째 결과 제외
      setIsRunning(false)
      newTimesRef.current = []
      iterationRef.current = 0
    } else {
      setTimeout(() => {
        runIteration()
      }, 100)
    }
  })
}, [virtualDomItems])

const runIteration = useCallback(() => {
  startTimeRef.current = performance.now()

  const newItems = Array.from({ length: count }, (_, i) => ({
    text: `number ${i}`,
    height: "20px",
    backgroundColor: i % 2 ? "#f0f0f0" : "#fff",
  }))

  setVirtualDomItems(newItems)
  iterationRef.current += 1
}, [count])

const runTest = useCallback(() => {
  setIsRunning(true)
  newTimesRef.current = []
  iterationRef.current = 0
  setVirtualDomItems([]) // 초기화

  // 첫 번째 반복 시작
  setTimeout(() => {
    runIteration()
  }, 100)
}, [runIteration])

const average = times.length
  ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)
  : 0
```

테스트는 똑같이 100, 1000, 5000 순서로 돌려보았습니다.

![](https://velog.velcdn.com/images/ryanbae94/post/af9c5f6c-b280-4ef9-803c-ca903251922a/image.png)

![](https://velog.velcdn.com/images/ryanbae94/post/d2b8a2da-78b9-407b-854e-e7aa2464b52b/image.png)

![](https://velog.velcdn.com/images/ryanbae94/post/b380eab5-538a-47fd-8f01-064902dc6f44/image.png)

결과 표

| 요소의 갯수 | 직접 삽입 방식 | Document Fragment 방식 | Virtual DOM 방식 |
| ----------- | -------------- | ---------------------- | ---------------- |
| 100         | 10.48ms        | 7.86ms                 | 3.48ms           |
| 1000        | 98.04ms        | 15.44ms                | 5.04ms           |
| 5000        | 1898.08ms      | 47.98ms                | 23.16ms          |

Virtual DOM의 압승입니다.

---

## 결론

DOM 조작 성능 차이의 주요 원인:

- 단순한 DOM 요소 생성이나 추가가 아닌, reflow/repaint 과정이 성능에 가장 큰 영향을 미칩니다.
- 직접 DOM 조작 방식에서는 각 요소 추가마다 reflow가 발생하여 요소 수가 증가할수록 기하급수적으로 성능이 저하됩니다.

최적화 방법별 효과:

- DocumentFragment를 사용하면 DOM 업데이트를 일괄처리하여 reflow/repaint 횟수를 크게 줄일 수 있습니다.
- Virtual DOM은 실제 DOM 조작을 최소화하고 변경사항을 효율적으로 배치 처리하여 가장 좋은 성능을 보여줍니다.

시사점:

- 소규모 DOM 조작(100개 이하)의 경우 세 방식 모두 실용적인 성능을 보여줍니다.
- 대규모 DOM 조작이 필요한 경우, Virtual DOM이나 DocumentFragment를 사용하는 것이 크게 유리합니다.
- Virtual DOM 기반 프레임워크의 사용이 항상 필수적인 것은 아니며, DocumentFragment와 같은 기본적인 최적화 기법으로도 상당한 성능 개선을 얻을 수 있습니다.

결론적으로 "DOM 조작은 느리다"는 통념이 맞지만, 그것이 Native DOM 자체의 문제라기보다는 최적화되지 않은 DOM 조작 방식의 문제임을 알 수 있었습니다. 만약 Native DOM과 Virtual DOM 사이에서 고민할 일이 생긴다면, 단순히 요소의 양 보다는 서비스 플로우에 따라 repaint와 reflow가 얼마나 발생할지를 고려해서 선택하는 것이 좋겠습니다!
