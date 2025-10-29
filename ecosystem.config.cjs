module.exports = {
  apps: [
    {
      name: "beastypage-frontend",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3000"
      }
    },
    {
      name: "beastypage-renderer",
      cwd: "./backend/renderer_service",
      script: "uv",
      args: "run uvicorn renderer_service.app.main:app --host 0.0.0.0 --port ${UVICORN_PORT:-8001}",
      interpreter: "none"
    }
  ]
};
