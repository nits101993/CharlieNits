# Deploy As A Web System

This project is designed to run as a hosted website with a small backend. You only need a browser after it is deployed.

## Why a backend is required

Government websites and APIs often block direct browser fetches through CORS, and data.gov.in API keys should not be hardcoded into frontend JavaScript. The backend fetches official sources, and the browser UI generates the UPSC notes.

## Recommended no-admin path: Render

1. Create a free GitHub account if you do not already have one.
2. Upload this `upsc-official-notes-app` folder to a private GitHub repository.
3. Go to `https://render.com`, create a Web Service, and connect the repository.
4. Use these settings:

```text
Runtime: Node
Build command: npm install --omit=dev
Start command: npm start
```

5. Add environment variables:

```text
HOST=0.0.0.0
DATAGOVIN_API_KEY=your-data-gov-in-key
APP_ACCESS_KEY=your-private-passcode
```

6. Open the Render URL from any laptop, phone, or tablet.
7. Enter the same `APP_ACCESS_KEY` in the website's "Site access key" field.

## Docker hosting option

Any cloud host that supports Docker can run:

```powershell
docker build -t upsc-official-notes-web .
docker run -p 8765:8765 -e HOST=0.0.0.0 -e APP_ACCESS_KEY=your-passcode upsc-official-notes-web
```

## Security notes

- Keep the repository private if you add keys or custom source settings.
- Do not put your data.gov.in key in frontend code.
- Set `APP_ACCESS_KEY` before sharing the website URL.
- Generated notes are extractive and rule-based; verify legal provisions, dates, and numbers against the official links.
