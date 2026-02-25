const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/__proxy",
    createProxyMiddleware({
      target: "http://localhost",
      changeOrigin: true,
      secure: true,
      router(req) {
        return req.headers["x-proxy-target"] || "http://localhost";
      },
      pathRewrite(path, req) {
        const proxyPath = req.headers["x-proxy-path"];
        if (proxyPath && typeof proxyPath === "string") {
          return proxyPath;
        }
        return path.replace(/^\/__proxy/, "");
      },
      logLevel: "warn",
    })
  );
};
