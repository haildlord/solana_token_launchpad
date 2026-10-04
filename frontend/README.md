# LordLaunch frontend

React app for the launchpad API. Built with Vite, React and React Router.

## Run it

1. Start the Worker from the project root (it listens on port 3000):

       npm run dev

2. In a second terminal:

       cd frontend
       npm install
       npm run dev

3. Open http://localhost:5173

The dev server forwards `/api` and `/uploads` to the backend, so no CORS setup is needed.
If the backend is on another address, set `VITE_BACKEND_URL`:

    VITE_BACKEND_URL=http://localhost:4000 npm run dev

## Build for production

    npm run build

The files end up in `frontend/dist`. On this branch the Cloudflare Worker serves them, so
`npm run deploy` in the project root builds and uploads the frontend together with the API.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Launch list with status filters and paging |
| `/launches/:id` | Launch details, buy form, purchases, vesting lookup. The creator also gets a Manage tab (image, whitelist, referral codes, edit) |
| `/create` | Create a launch with image, tiers and vesting (login needed) |
| `/login`, `/register` | Account pages |
