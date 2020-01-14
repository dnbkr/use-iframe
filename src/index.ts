import {
  RefObject,
  useCallback,
  useEffect,
  useState,
  Dispatch,
  SetStateAction
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

const packetId = "__fromUseIframeHook";

function encodeMessage<Message>(message: Message) {
  return JSON.stringify({ payload: JSON.stringify(message), [packetId]: true });
}

function decodeMessage<Message>(raw: any): Message | undefined {
  try {
    const decoded = JSON.parse(raw);
    if (packetId in decoded && decoded[packetId] === true) {
      const message = JSON.parse(decoded.payload) as Message;
      return message;
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
}

export function useIframe<Message = any>(
  handleMessage: MessageHandler<Message>,
  options?: Options
): UseIframeResult<Message> {
  const isParent = options?.ref !== undefined;

  const dispatch = useCallback(
    (message: Message) => {
      if (isParent && options?.ref?.current) {
        options.ref.current.contentWindow?.postMessage(
          encodeMessage(message),
          "*"
        );
      } else if (isParent === false) {
        window.parent.postMessage(encodeMessage(message), "*");
      }
    },
    [isParent, options]
  );

  const eventListener = useCallback(
    (event: MessageEvent) => {
      const message = decodeMessage<Message>(event.data);
      if (message) {
        handleMessage(message, dispatch);
      }
    },
    [handleMessage, dispatch]
  );

  useEffect(() => {
    window.addEventListener("message", eventListener);
    return () => window.removeEventListener("message", eventListener);
  }, [eventListener]);

  return [dispatch];
}

export function useIframeEvent<EventName = string>(
  eventName: EventName
): [() => void];

export function useIframeEvent<EventName = string>(
  eventName: EventName,
  handleEvent: () => void,
  ref: RefObject<HTMLIFrameElement>
): void;

export function useIframeEvent<EventName = string>(
  eventName: EventName,
  handleEvent?: () => void,
  ref?: RefObject<HTMLIFrameElement>
): void | [() => void] {
  const handleMessage: MessageHandler<EventName> = useCallback(
    event => {
      if (handleEvent && event === eventName) {
        handleEvent();
      }
    },
    [handleEvent, eventName]
  );

  const [dispatch] = useIframe(handleMessage, { ref });

  const onEventHandler = useCallback(() => {
    dispatch(eventName);
  }, [eventName, dispatch]);

  if (ref) {
    return;
  }

  return [onEventHandler];
}

type SharedStateMessageType<S> =
  | { type: "__private_mounted" }
  | { type: "__private_unmounted" }
  | { type: "__private_set-state"; state: S };

export function useIframeSharedState<S>(
  initialState: S | (() => S),
  ref?: RefObject<HTMLIFrameElement>
): [S, Dispatch<SetStateAction<S>>] {
  const [localState, setLocalState] = useState<S>(initialState);
  const [mounted, setMounted] = useState(false);

  const handler: MessageHandler<SharedStateMessageType<S>> = useCallback(
    message => {
      switch (message.type) {
        case "__private_mounted":
          return setMounted(true);
        case "__private_unmounted":
          return setMounted(false);
        case "__private_set-state":
          return setLocalState(message.state);
      }
    },
    [setMounted]
  );

  const isParent = ref !== undefined;

  const [dispatch] = useIframe(handler, { ref });

  useEffect(() => {
    if (!isParent) {
      dispatch({ type: `__private_mounted` });
      return () => dispatch({ type: "__private_unmounted" });
    }
    return;
  }, [isParent, dispatch]);

  useEffect(() => {
    if (isParent && mounted) {
      dispatch({ type: "__private_set-state", state: localState });
    }
  }, [isParent, mounted, localState, dispatch]);

  return [localState, setLocalState];
}
