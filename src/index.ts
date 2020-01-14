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
  skip?: boolean;
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
  const skip = options?.skip === true

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
    if (skip) {
      return
    }
    window.addEventListener("message", eventListener);
    return () => window.removeEventListener("message", eventListener);
  }, [skip, eventListener]);

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

type SharedStateMessageType<S> =
  | { type: "__private_mounted" }
  | { type: "__private_unmounted" }
  | { type: "__private_set-state"; state: S };

export function useIframeSharedState<S>(
  initialState: S | (() => S),
  options?: Options
): [S, Dispatch<SetStateAction<S>>] {
  const skip = options?.skip === true

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

  const isParent = options?.ref !== undefined;

  const [dispatch] = useIframe(handler, options);

  useEffect(() => {
    if (skip) {
      return
    }
    if (!isParent) {
      dispatch({ type: `__private_mounted` });
      return () => dispatch({ type: "__private_unmounted" });
    }
    return;
  }, [skip, isParent, dispatch]);

  useEffect(() => {
    if (skip) {
      return
    }
    if (isParent && mounted) {
      dispatch({ type: "__private_set-state", state: localState });
    }
  }, [skip, isParent, mounted, localState, dispatch]);

  return [localState, setLocalState];
}
