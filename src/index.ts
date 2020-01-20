import {
  RefObject,
  useCallback,
  useEffect,
  useState,
  Dispatch,
  SetStateAction,
  useRef,
  useMemo
} from "react";

interface Options {
  ref?: RefObject<HTMLIFrameElement>;
}

type MessageDispatcher<Message> = (message: Message) => void;

type UseIframeResult<Message> = [MessageDispatcher<Message>];

export type MessageHandler<Message> = (
  message: Message,
  dispatch: MessageDispatcher<Message>
) => void;

interface PrivateMessage {
  __private: true;
  type: "mounted";
  id: string;
}

const packetId = "__fromUseIframeHook";

function encodeMessage<Message>(message: Message, fromId?: string) {
  return JSON.stringify({
    fromId,
    payload: JSON.stringify(message),
    [packetId]: true
  });
}

function decodeMessage<Message>(
  raw: any
): [Message, string | undefined] | undefined {
  try {
    const decoded = JSON.parse(raw);
    if (packetId in decoded && decoded[packetId] === true) {
      const message = JSON.parse(decoded.payload) as Message;
      return [message, decoded.fromId];
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
}

function isPrivateMessage(message: any): message is PrivateMessage {
  return (
    message.hasOwnProperty("__private") &&
    "__private" in message &&
    message.__private === true
  );
}

export function useIframe<Message = any>(
  handleMessage: MessageHandler<Message>,
  options?: Options
): UseIframeResult<Message> {
  const ref = options?.ref;

  const isParent = useMemo(() => ref !== undefined, [ref]);
  const isChild = !isParent && window !== window.top

  /** Scope: Parent */
  const [iframeId, setIframeId] = useState<string>();
  useEffect(() => {
    setIframeId(ref?.current?.id);
  }, [ref]);

  const [queue, setQueue] = useState<(Message | PrivateMessage)[]>([]);

  const [childId, setChildId] = useState<string>();

  /** Scope Parent */
  const isChildMounted = childId !== undefined;

  const dispatch = useCallback((message: Message) => {
    setQueue(q => [...q, message]);
  }, []);

  const dispatchPrivate = useCallback((message: PrivateMessage) => {
    setQueue(q => [...q, message]);
  }, []);

  const handlePrivateMessage = useCallback(
    (message: PrivateMessage) => {
      switch (message.type) {
        case "mounted":
          if (message.id === iframeId) {
            return setChildId(message.id);
          }
      }
    },
    [iframeId]
  );

  const postMessage = useCallback(
    (message: Message | PrivateMessage) => {
      if (isParent && ref?.current) {
        ref.current.contentWindow?.postMessage(encodeMessage(message), "*");
      } else if (isChild) {
        window.parent.postMessage(encodeMessage(message, childId), "*");
      }
    },
    [isParent, isChild, childId, ref]
  );

  useEffect(() => {
    const message = queue[0];
    if (isParent) {
      if (message && isChildMounted) {
        setQueue(q => q.slice(1));
        postMessage(message);
      }
    } else if (isChild) {
      if (message) {
        setQueue(q => q.slice(1));
        postMessage(message);
      }
    }
  }, [isParent, isChild, isChildMounted, postMessage, queue]);

  const eventListener = useCallback(
    (event: MessageEvent) => {
      const [message, fromId] =
        decodeMessage<Message | PrivateMessage>(event.data) || [];
      if (message) {
        if (isPrivateMessage(message)) {
          handlePrivateMessage(message);
        } else {
          if (isParent) {
            if (iframeId === fromId) {
              handleMessage(message, dispatch);
            }
          } else if (isChild) {
            handleMessage(message, dispatch);
          }
        }
      }
    },
    [handlePrivateMessage, isChild, isParent, iframeId, handleMessage, dispatch]
  );

  useEventListener(eventListener);

  useEffect(() => {
    if (isChild) {
      const iframes = Array.from(
        window.parent.document.getElementsByTagName("iframe")
      );
      const iframe = iframes.find(iframe => iframe.contentWindow === window);
      if (iframe) {
        dispatchPrivate({ type: "mounted", id: iframe.id, __private: true });
        setChildId(iframe.id);
      }
    }
  }, [dispatchPrivate, isChild]);

  if (isParent && ref?.current && !iframeId) {
    throw new Error("iframes must have an ID set");
  }

  return [dispatch];
}

export function useIframeEvent<EventName = string>(
  eventName: EventName,
  handleEvent?: () => void,
  options?: Options
): [() => void] {
  const handleMessage: MessageHandler<EventName> = useCallback(
    event => {
      if (handleEvent && event === eventName) {
        handleEvent();
      }
    },
    [handleEvent, eventName]
  );

  const [dispatch] = useIframe(handleMessage, options);

  const onEventHandler = useCallback(() => {
    dispatch(eventName);
  }, [eventName, dispatch]);

  return [onEventHandler];
}

type SharedStateMessageType<S> = {
  type: "__private_set-state";
  state: S;
  time: number;
};

export function useIframeSharedState<S>(
  initialState: S | (() => S),
  options?: Options
): [S, Dispatch<SetStateAction<S>>] {
  const stateAge = useRef({
    local: new Date().getTime(),
    remote: 0
  });
  const [internalState, setInternalState] = useState<S>(initialState);
  const [remoteState, setRemoteState] = useState<S>(initialState);

  const handler: MessageHandler<SharedStateMessageType<S>> = useCallback(
    message => {
      switch (message.type) {
        case "__private_set-state":
          stateAge.current.remote = message.time;
          return setRemoteState(message.state);
      }
    },
    []
  );

  const [dispatch] = useIframe(handler, options);

  useEffect(() => {
    const now = new Date().getTime();
    stateAge.current.local = now;
    dispatch({ type: "__private_set-state", state: internalState, time: now });
  }, [internalState, dispatch]);

  const state =
    stateAge.current.local > stateAge.current.remote
      ? internalState
      : remoteState;

  return [state, setInternalState];
}

type MessageEventListener = (event: MessageEvent) => void;

function useEventListener(
  handler: MessageEventListener,
  element: HTMLElement | Window = window
) {
  const savedHandler = useRef<MessageEventListener>();

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const isSupported = element && element.addEventListener;
    if (!isSupported) return;
    const eventListener = (event: Event) =>
      savedHandler.current?.(event as MessageEvent);
    element.addEventListener("message", eventListener);
    return () => {
      element.removeEventListener("message", eventListener);
    };
  }, [element]);
}
