module.exports = {
  apps: [
    {
      name: "beastypage-web",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        RENDERER_INTERNAL_URL: "http://127.0.0.1:8001",
      }
    },
    {
      name: "beastypage-renderer",
      cwd: "./backend/renderer_service",
      script: "uv",
      args: `run uvicorn renderer_service.app.main:app --host 0.0.0.0 --port ${process.env.UVICORN_PORT || "8001"}`,
      interpreter: "none",
      env: {
        UVICORN_PORT: process.env.UVICORN_PORT || "8001"
      }
    },
    {
      name: "beastypage-img",
      cwd: "./backend/img_service",
      script: "uv",
      args: `run uvicorn img_service.app.main:app --host 0.0.0.0 --port ${process.env.IMG_SERVICE_PORT || "8011"}`,
      interpreter: "none",
      env: {
        IMG_SERVICE_PORT: process.env.IMG_SERVICE_PORT || "8011"
      }
    }
  ]
};
