/**
 * 서버(Node) 폴리필 — pdfjs-dist 4.x 는 Promise.withResolvers(Node 22+)를 쓰므로
 * Node 20 운영 서버에서도 돌아가도록 먼저 채워 둔다. pdfjs를 import 하는 파일에서 이 모듈을 가장 먼저 import 할 것.
 */
type WithResolvers = <T>() => { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };

const P = Promise as unknown as { withResolvers?: WithResolvers };
if (typeof P.withResolvers !== "function") {
  P.withResolvers = function <T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

export {};
