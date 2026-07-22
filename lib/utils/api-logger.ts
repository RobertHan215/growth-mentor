/**
 * API 日志中间件
 * 为所有 API 路由统一打印入参、出参、耗时
 */

type Handler = (request: Request, ...args: unknown[]) => Promise<Response> | Response;

function withLogging(prefix: string, handler: Handler) {
  return async (request: Request, ...args: unknown[]) => {
    const start = Date.now();
    const method = request.method;
    const url = request.url;

    let input: unknown = null;
    try {
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        input = await request
          .clone()
          .json()
          .catch(() => '[non-JSON body]');
      } else {
        input = Object.fromEntries(new URL(url).searchParams);
      }
    } catch {
      input = '[parse error]';
    }

    console.log(`[API] ${prefix} IN  ${method} ${url}`, JSON.stringify(input));

    try {
      const response = await handler(request, ...args);
      const elapsed = Date.now() - start;
      const cloned = response.clone();
      let output: unknown = null;
      try {
        output = await cloned.json();
      } catch {
        output = '[non-JSON body or stream]';
      }
      console.log(
        `[API] ${prefix} OUT ${method} ${url} ${response.status} ${elapsed}ms`,
        JSON.stringify(output),
      );
      return response;
    } catch (error) {
      const elapsed = Date.now() - start;
      console.error(`[API] ${prefix} ERR ${method} ${url} ${elapsed}ms`, error);
      throw error;
    }
  };
}

export { withLogging };
