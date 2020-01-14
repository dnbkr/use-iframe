# Use Iframe Hooks

A collection of React Hooks to facilitate communication between iframes and their parents.

If you want to use iframes to embed React-rendered content in your React application, these hooks will help you should you need to communicate with the embedded component.

## Installation

```
npm install --save use-iframe
```

or 

```
yarn add use-iframe
```

The library is written in Typescript and ships with it's own type definitions to no additional type defs need to be installed.

## Usage

There are three hooks exported by this library:

* [`useIframe`](#use-iframe) for general messaging between parent and child
* [`useIframeEvent`](#use-iframe-event) for event handling between parent and child
* [`useIframeSharedState`](#use-iframe-shared-state) for sharing state between parent and child

Here, we are using "parent" to refer to the React component that renders the iframe, and "child" to refer to the React component being used inside the iframe.

You may notice in the examples that handler functions are wrapped in `useCallback`. This is because when the handler function changes, some tear-down and build-up needs to occur and so to maintain performance you should `useCallback` to limit the function's reference needlessly changing between renders. To read more about `useCallback` check out the [React documentation](https://reactjs.org/docs/hooks-reference.html#usecallback)

### use iframe

Lets say we have a parent component that is rendering an iframe:

```javascript

// The Parent

import React, { useRef } from 'react';

export const Parent = () => {
  const ref = useRef(null)

  return (
    <div>
      <p>I am the parent component</p>
      <iframe ref={ref} src="/iframe-content" />
    </div>
  )
}

```

and the child component that is being rendered:

```javascript

// The Child

import React from 'react';

export const Child = () => {

  return (
    <div>
      <p>I am the child component</p>
    </div>
  )
}

```

In our parent, we can make use of the `useIframe` hook to both dispatch messages to the child, and to handle messages from the child:

```javascript

// The Parent

import React, { useRef, useCallback } from 'react';
import { useIframe } from 'use-iframe';

export const Parent = () => {
  const ref = useRef(null)

  const handler = useCallback(message => {
    switch (message.type) {
      case "child-says":
        console.log(`The child said: ${message.text}`)
    }
  }, [])

  const [dispatch] = useIframe(handler, { ref })

  const onClick = () => dispatch({ type: "parent-says", text: "Hello, Child!" })

  return (
    <div>
      <p>I am the parent component</p>
      <button onClick={onClick}>Parent say message</button>
      <iframe ref={ref} src="/iframe-content" />
    </div>
  )
}

```

and the child component would look like:

```javascript

// The Child

import React, { useCallback } from 'react';
import { useIframe } from 'use-iframe';

export const Child = () => {

  const handler = useCallback(message => {
    switch (message.type) {
      case "parent-says":
        console.log(`The parent said: ${message.text}`)
    }
  }, [])

  const [dispatch] = useIframe(handler)
  
  const onClick = () => dispatch({ type: "child-says", text: "Hi, Parent!" })

  return (
    <div>
      <button onClick={onClick}>Child say message</button>
      <p>I am the child component</p>
    </div>
  )
}

```

Messages can be any JSON-serialisable data, but it's recommended to have a "type" string to help identify what message is being sent and recieved on either end, and you can see in the example above.

Note, that if you are using Typescript then your messages can be declared so you can safely use different message schemas in your handler:

```typescript

import { useIframe, MessageHandler } from 'use-iframe';

type Message =
  | { type: "text-message", text: string }
  | { type: "other-message", content: string }

const handler: MessageHandler<Message> = useCallback(message => {
  switch (message.type) {
    case "text-message":
      console.log(message.text)
    case "other-message":
      console.log(message.content)
  }
}, [])

const [dispatch] = useIframe<Message>(handler)

```

The hook knows if it's being rendered in the parent or the child by the presense of the `ref` being passed into it. If you're writing the parent, pass the `ref` so the hook knows which iframe to talk to.


### use iframe event

This hook is specifically for use with events and event handlers. In our example, lets say there's a button rendered in the iframe (the child) and we want to run a callback in the parent when the button is clicked. It would look like this:

```javascript

// The Parent

import React, { useRef, useCallback } from 'react';
import { useIframeEvent } from 'use-iframe';

export const Parent = () => {
  const ref = useRef(null)

  const onHelloClicked = useCallback(() => {
    console.log("Someone Clicked Hello!")
  }, [])

  useIframeEvent("hello-btn-clicked", onHelloClicked, ref)

  return (
    <div>
      <p>I am the parent component</p>
      <iframe ref={ref} src="/iframe-content" />
    </div>
  )
}

```


```javascript

// The Child

import React from 'react';
import { useIframeEvent } from 'use-iframe';

export const Child = () => {

  const [onHelloClicked] = useIframeEvent("hello-btn-clicked")

  return (
    <div>
      <p>I am the child component</p>
      <button onClick={onHelloClicked}>Hello</button>
    </div>
  )
}

```

### use iframe shared state

This hook is specifically for sharing some state with the child iframe being rendered by a parent. Both parent and child can mutate state, and it should stay in sync between the two. It is based on the built-in `setState` React hook.

```javascript

// The Parent

import React, { useRef, useCallback } from 'react';
import { useIframeSharedState } from 'use-iframe';

export const Parent = () => {
  const ref = useRef(null)

  const [state, setState] = useIframeSharedState({ count: 1 }, ref);

  const onIncrease = () => setState(state => ({ ...state, count: state.count + 1 }))

  const onDecrease = () => setState(state => ({ ...state, count: state.count - 1 }))

  return (
    <div>
      <p>I am the parent component</p>
      <button onClick={onDecrease}>Decrease</button>
      <button onClick={onIncrease}>Increase</button>
      <iframe ref={ref} src="/iframe-content" />
    </div>
  )
}

```


```javascript

// The Child

import React from 'react';
import { useIframeSharedState } from 'use-iframe';

export const Child = () => {

  const [state] = useIframeSharedState({ count: 1 })

  return (
    <div>
      <p>I am the child component</p>
      <p>The count is: {state.count}</p>
    </div>
  )
}

```

Note that the initial state must be set on both ends, and should be set the same.

Also note, you should only set up *ONE* piece of shared state per iframe.