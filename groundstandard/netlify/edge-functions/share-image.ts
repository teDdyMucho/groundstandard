export default async (request: Request) => {
  const url = new URL(request.url);
  const imagePath = url.pathname.replace('/img/', '');
  const originalImageUrl = `https://qkwiauivaerrrbemdlyj.supabase.co/storage/v1/object/public/image-content/${imagePath}`;
  const ogImageUrl = `https://qkwiauivaerrrbemdlyj.supabase.co/storage/v1/render/image/public/image-content/${imagePath}?width=1200&height=630&resize=cover`;
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
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Ground Standard" />
  <meta name="twitter:image" content="${originalImageUrl}" />
  <title>Ground Standard</title>
  <script>window.location.replace("https://groundstandard.netlify.app/raw-img/${imagePath}");</script>
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
