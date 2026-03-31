export default async (request: Request) => {
  const url = new URL(request.url);
  const imagePath = url.pathname.replace('/img/', '');
  const imageUrl = `https://qkwiauivaerrrbemdlyj.supabase.co/storage/v1/object/public/image-content/${imagePath}`;
  const rawImageUrl = `https://groundstandard.netlify.app/raw-img/${imagePath}`;
  const shareUrl = `https://groundstandard.netlify.app/img/${imagePath}`;

  // Check if request is from a social media crawler
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  const isCrawler = ua.includes('facebookexternalhit') || ua.includes('twitterbot') || ua.includes('linkedinbot') || ua.includes('whatsapp') || ua.includes('telegrambot') || ua.includes('slackbot') || ua.includes('discordbot');

  if (isCrawler) {
    // Serve HTML with OG tags — og:image points to /raw-img/ which serves the actual image
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Ground Standard" />
  <meta property="og:title" content="Ground Standard" />
  <meta property="og:description" content="Image from Ground Standard" />
  <meta property="og:image" content="${rawImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${shareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Ground Standard" />
  <meta name="twitter:image" content="${rawImageUrl}" />
  <title>Ground Standard</title>
</head>
<body></body>
</html>`;
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // For regular browsers, proxy the actual image
  const imageRes = await fetch(imageUrl);
  const headers = new Headers(imageRes.headers);
  headers.set('cache-control', 'public, max-age=31536000');
  return new Response(imageRes.body, {
    status: imageRes.status,
    headers,
  });
};

export const config = { path: "/img/*" };
