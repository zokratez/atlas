module.exports = {
  apps: [
    {
      name: "atlas-scout",
      cwd: __dirname,
      script: "dist/workers/scout.js",
      interpreter: "node",
      cron_restart: "0 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      interpreter: "node",
      cron_restart: "0 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-quill",
      cwd: __dirname,
      script: "dist/workers/quill.js",
      interpreter: "node",
      cron_restart: "30 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens-weekly",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      args: "--cadence weekly",
      interpreter: "node",
      cron_restart: "0 23 * * 0",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens-monthly",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      args: "--cadence monthly",
      interpreter: "node",
      cron_restart: "15 23 1 * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens-quarterly",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      args: "--cadence quarterly",
      interpreter: "node",
      cron_restart: "30 23 1 1,4,7,10 *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
