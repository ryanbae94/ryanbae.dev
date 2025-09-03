---
title: "상태 머신으로 복잡한 상태 길들이기"
description: "상태 머신으로 복잡한 상태 길들이기"
date: 2025-08-21
update: 2025-08-21
tags:
  - 상태관리
---


# 왜 '지갑 연결' 코드는 금방 괴물이 될까? 상태 머신으로 길들이기



Web3 프론트엔드 개발자라면 누구나 한 번쯤 겪어봤을 과제가 있습니다. 바로 '지갑 연결' 기능 구현입니다. 처음에는 간단해 보입니다. 버튼 하나, `connect()` 함수 호출, `useState` 몇 개면 끝날 것 같죠.

하지만 여기에 '멀티체인'이라는 조건이 붙는 순간, 이 간단했던 코드는 금세 수많은 `if`문과 예외 처리로 뒤엉킨 **괴물**이 되어버립니다. "메타마스크는 연결됐는데 팬텀 지갑은 왜 안 되지?", "체인 바꾸라고 안내했는데 사용자가 거부하면 어떡하지?", "분명 연결됐는데 왜 결제가 안 되는 거야?" 같은 문제들이 터져 나오기 시작합니다.

이 글에서는 이 복잡성의 근원을 파헤치고, '상태 머신(State Machine)'이라는 강력한 패턴과 `XState` 라이브러리를 통해 어떻게 이 괴물을 길들일 수 있는지 실제 코드를 비교하며 보여드립니다.



## 코드 비교: `useState`의 혼돈 vs `XState`의 질서

동일한 요구사항을 가진 '지갑 연결 및 결제' 컴포넌트를 두 가지 방식으로 구현해 보겠습니다.

### AS-IS: `useState`와 `useEffect`로 구현한 컴포넌트

가장 일반적인 접근 방식입니다. 필요한 상태를 `boolean`과 `string` 변수로 모두 꺼내놓고, 하나의 거대한 핸들러 함수 안에서 모든 것을 처리하려 합니다.

```jsx
// WalletButton_AsIs.jsx
import React, { useState } from 'react';
import { walletApi } from './api'; // 가상의 API

function WalletButton_AsIs() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isWrongChain, setIsWrongChain] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);
  
  const TARGET_CHAIN_ID = 137; 

  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const { address, chainId } = await walletApi.connectWallet();
      setAddress(address);
      setIsConnected(true);

      if (chainId !== TARGET_CHAIN_ID) {
        setIsWrongChain(true);
      } else {
        setIsWrongChain(false);
      }
    } catch (e) {
      setError('지갑 연결에 실패했습니다.');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchChain = async () => {
    // ... 체인 변경 로직 ...
  };
  
  const handlePay = async () => {
    // ... 결제 로직 ...
  };

  // UI 렌더링 로직은 점점 더 복잡해집니다.
  if (error) return <div>에러: {error} <button onClick={handleConnect}>다시 시도</button></div>;
  if (isConnecting) return <div>연결 중...</div>;
  if (isConnected) {
    if (isWrongChain) {
      return <div><p>네트워크를 변경해주세요.</p><button onClick={handleSwitchChain}>체인 변경</button></div>;
    }
    return <div><p>{address}님 환영합니다.</p><button onClick={handlePay} disabled={isSending}>{isSending ? '결제 중...' : '1 ETH 결제'}</button></div>;
  }

  return <button onClick={handleConnect}>지갑 연결</button>;
}
```
<strong>문제점:</strong>

- '불가능한 상태' 발생 가능성: isConnecting이 true인데 isConnected도 true인 상태가 실수로 만들어질 수 있습니다.

- 흩어진 로직: 상태를 변경하는 `set...` 함수들이 여러 핸들러에 흩어져 있어 흐름을 파악하기 어렵습니다.

- 복잡한 렌더링: UI를 보여주기 위한 조건문(if, else if, ...)이 끝없이 길어집니다.

### TO-BE: XState 상태 머신으로 리팩토링한 컴포넌트
먼저 모든 로직을 담은 '지도', 즉 머신을 정의합니다. 그리고 컴포넌트는 이 지도를 사용하기만 하면 됩니다.

```javascript
// web3Machine.js (로직의 '설계도')
import { createMachine, assign } from 'xstate';
import { walletApi } from './api';

export const web3Machine = createMachine({
  id: 'web3',
  context: {
    address: null,
    chainId: null,
    paymentError: null,
    txHash: null,
  },
  type: 'parallel',
  states: {
    wallet: {
      initial: 'disconnected',
      states: {
        disconnected: { on: { CONNECT: 'connecting' } },
        connecting: {
          invoke: {
            src: () => walletApi.connectWallet(),
            onDone: { target: 'connected', actions: assign((ctx, evt) => ({ ...evt.data })) },
            onError: 'disconnected',
          },
        },
        connected: {
          initial: 'checkingChain',
          states: {
            checkingChain: {
              always: [
                { target: 'correctChain', guard: 'isCorrectChain' },
                { target: 'wrongChain' },
              ],
            },
            wrongChain: { on: { SWITCH_CHAIN: 'switchingChain' } },
            switchingChain: {
              invoke: {
                src: (ctx, evt) => walletApi.switchChain(evt.chainId),
                onDone: 'correctChain',
                onError: 'wrongChain',
              },
            },
            correctChain: {},
          },
        },
      },
    },
    payment: {
      initial: 'idle',
      states: {
        idle: { on: { PAY: { target: 'sending', cond: 'isWalletReady' } } },
        sending: {
          invoke: {
            src: (ctx, evt) => walletApi.sendTransaction(evt.tx),
            onDone: { target: 'success', actions: assign({ txHash: (ctx, evt) => evt.data }) },
            onError: { target: 'failure', actions: assign({ paymentError: (ctx, evt) => evt.data }) },
          },
        },
        success: { on: { FINISH: 'idle' } },
        failure: { on: { RETRY: 'sending' } },
      },
    },
  },
}, {
  guards: {
    isCorrectChain: (context) => context.chainId === 137,
    isWalletReady: (context, event, { state }) => state.matches('wallet.connected.correctChain'),
  },
});
```

이제 이 머신을 사용하는 React 컴포넌트는 `if` 지옥을 피하고, 간결하고 명시적으로 UI를 렌더링 할 수 있습니다.

```javascript
// WalletButton_ToBe.jsx
import React from 'react';
import { useMachine } from '@xstate/react';
import { web3Machine } from './web3Machine';

function WalletButton_ToBe() {
  // 머신의 현재 상태(state)와 이벤트를 보내는 함수(send)
  const [state, send] = useMachine(web3Machine);
  const { address, paymentError, txHash } = state.context;

  return (
    <div>
      {/* 연결되지 않았을 때 */}
      {state.matches('wallet.disconnected') && (
        <button onClick={() => send('CONNECT')}>지갑 연결</button>
      )}

      {/* 연결 중일 때 */}
      {state.matches('wallet.connecting') && <div>연결 중...</div>}
      
      {/* 연결은 됐지만 체인이 잘못됐을 때 */}
      {state.matches('wallet.connected.wrongChain') && (
        <div>
          <p>네트워크를 변경해주세요.</p>
          <button onClick={() => send({ type: 'SWITCH_CHAIN', chainId: 137 })}>
            체인 변경
          </button>
        </div>
      )}

      {/* 모든 준비가 완료되었을 때 */}
      {state.matches('wallet.connected.correctChain') && (
        <div>
          <p>{address}님 환영합니다.</p>
          {state.matches('payment.idle') && (
            <button onClick={() => send({ type: 'PAY', tx: { /* ... */ } })}>
              1 ETH 결제
            </button>
          )}
          {state.matches('payment.sending') && <div>결제 진행 중...</div>}
          {state.matches('payment.success') && <div>✅ 결제 성공! TX: {txHash}</div>}
          {state.matches('payment.failure') && <div>❌ 결제 실패: {paymentError}</div>}
        </div>
      )}
    </div>
  );
}
```


## '연결-체인 선택-결제'는 왜 단순한 로직이 아닐까?

표면적으로 보면 Web3 서비스의 핵심 흐름은 단순해 보입니다. 하지만 실제 구현에 들어가면 우리는 수많은 '곁가지'와 마주하게 됩니다.

사용자 환경의 파편화:

- 설치 여부: 사용자의 브라우저에 지갑이 설치되지 않았을 수 있습니다.

- 잠금 상태: 지갑이 설치되었더라도, 비밀번호로 잠겨 있을 수 있습니다.

- 다양한 지갑: 메타마스크, 팬텀 등 지갑마다 API가 미묘하게 다릅니다.

불안정한 네트워크와 사용자:

- 잘못된 체인: 서비스는 폴리곤을 원하는데 사용자는 이더리움에 연결되어 있을 수 있습니다.

- 요청 거부: "체인을 바꿔주세요"라는 요청을 사용자가 거부할 수 있습니다.

- RPC 오류: 블록체인 노드와의 통신은 언제든 실패할 수 있습니다.

수많은 실패 경로를 가진 결제:

- 서명 거부: 사용자는 언제든 결제 서명 팝업을 닫아버릴 수 있습니다.

- 가스비 부족: 트랜잭션을 실행할 수수료가 부족할 수 있습니다.

- 긴 대기 시간(Pending): 트랜잭션이 블록에 포함되기까지는 시간이 걸립니다.

- 트랜잭션 실패: 네트워크 혼잡, 컨트랙트 오류 등 다양한 이유로 실패할 수 있습니다.

이 모든 '곁가지'들을 `boolean` 상태 변수와 `if/else` 문으로 처리하려고 하면, 코드는 금방 복잡해지고 '불가능한 상태(Impossible States)' 가 발생하며 버그의 온상이 됩니다.

## 결론: 복잡성은 피하는 것이 아니라 관리하는 것

As-Is 코드가 나쁜 코드라는 의미는 아닙니다. 하지만 기능이 복잡해질수록 관리의 어려움이 기하급수적으로 늘어납니다. 상태 머신은 이 복잡성을 '관리'하기 위한 매우 효과적인 도구입니다.

상태 머신을 통해 우리는 '무엇을 해야 하는지(로직)' 를 '어떻게 보여줄지(UI)' 로부터 완벽하게 분리할 수 있습니다.

Web3 프론트엔드 개발의 복잡성은 피할 수 없습니다. `useState`와 `if`문으로 흩어진 로직을 관리하려 애쓰는 대신, 상태 머신이라는 검증된 패턴을 통해 기능의 흐름을 명확한 '지도'로 설계해 보았습니다. 결과적으로 코드는 예측 가능해지고, 버그는 줄어들며, "새로운 체인 하나 더 추가해 주세요" 같은 요구사항이 들어왔을 때 더 이상 안된다고 말하지 않게 되었습니다.
