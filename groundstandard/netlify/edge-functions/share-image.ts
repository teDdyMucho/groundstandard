export default async (request: Request) => {
  const url = new URL(request.url);
  const imagePath = url.pathname.replace('/img/', '');
  const rawImageUrl = `https://groundstandard.netlify.app/raw-img/${imagePath}`;
  const shareUrl = `https://groundstandard.netlify.app/img/${imagePath}`;

  // Always serve HTML with OG tags + instant redirect for browsers
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Ground Standard" />
  <meta property="og:title" content="Ground Standard" />
  <meta property="og:description" content="Image from Ground Standard" />
  <meta property="og:image" content="${rawImageUrl}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Ground Standard" />
  <meta name="twitter:image" content="${rawImageUrl}" />
  <title>Ground Standard</title>
  <script>window.location.replace("${rawImageUrl}");</script>
</head>
<body>
  <p>Loading image...</p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

export const config = { path: "/img/*" };
