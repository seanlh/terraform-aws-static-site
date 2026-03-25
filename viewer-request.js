// CloudFront Function — viewer-request
// Runs before every request reaches the origin.
//
// Two behaviors:
//   1. Apex redirect: seanlh.com/* → 301 → https://www.seanlh.com/*
//   2. Index append:  /path or /path/ → /path/index.html
//      (only for paths that have no file extension)
//
// DOMAIN is replaced at deploy time via templatefile().

function handler(event) {
  var req = event.request;

  // Guard: host header is always present in real requests, but be safe.
  if (!req.headers.host) {
    return req;
  }

  var host = req.headers.host.value;
  var uri  = req.uri;

  // 1. Redirect bare domain → www (301 permanent).
  //    The browser then re-requests via www, hitting behavior #2 below.
  if (host === "DOMAIN") {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: {
        location: { value: "https://www.DOMAIN" + uri }
      }
    };
  }

  // 2. Append index.html to directory-style paths on www.
  //    /         → /index.html
  //    /about    → /about/index.html  (no dot after last slash)
  //    /about/   → /about/index.html  (trailing slash)
  //    /style.css → unchanged          (has extension)
  if (uri.endsWith("/")) {
    req.uri = uri + "index.html";
  } else if (!uri.split("/").pop().includes(".")) {
    req.uri = uri + "/index.html";
  }

  return req;
}
