# MGE Team Verification

Local-first Node.js verification system for the MGE 2026 Fortnite tournament.

## Railway deployment

This app is ready for Railway deployment.

### 1. Push the project to GitHub

Railway deploys cleanly from a GitHub repository.

### 2. Create a Railway project

- In Railway, create a new project from your GitHub repo.
- Railway should detect the app automatically and run `npm start`.

### 3. Add environment variables

Set these variables in Railway:

- `HOST=0.0.0.0`
- `PORT=3000`
- `DATA_DIR=/data`
- `ADMIN_USERNAME=your-admin-username`
- `ADMIN_PASSWORD=your-strong-password`
- `NODE_ENV=production`
- `COOKIE_SECURE=true`

You can copy the values from [.env.example](./.env.example) and replace the admin credentials.

### 4. Attach a Railway volume

This app stores submissions and uploaded identity files on disk, so you should mount a persistent volume.

Recommended mount path:

- `/data`

The app will write:

- `/data/submissions.json`
- `/data/uploads/*`

### 5. Public and admin URLs

After deploy:

- Share the root URL `/` with players
- Keep `/review.html` for admins only

## Local run

```bash
npm start
```
