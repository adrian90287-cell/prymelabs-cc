async function loadLatestPrymeLabsBuild() {
  const response = await fetch(`/?pl_latest_bundle=${Date.now()}`, {
    cache: 'reload',
    headers: { Accept: 'text/html' },
  })

  if (!response.ok) {
    throw new Error(`Latest shell request failed with ${response.status}`)
  }

  const html = await response.text()
  const shell = new DOMParser().parseFromString(html, 'text/html')

  for (const link of shell.querySelectorAll('link[rel="stylesheet"][href], link[rel="modulepreload"][href]')) {
    const href = link.getAttribute('href')
    if (!href) continue

    const alreadyPresent = Array.from(document.head.querySelectorAll('link[href]')).some(
      (existing) => existing.getAttribute('href') === href,
    )

    if (!alreadyPresent) {
      document.head.appendChild(link.cloneNode(true))
    }
  }

  const entry = shell.querySelector('script[type="module"][src]')
  const src = entry?.getAttribute('src')

  if (!src) {
    throw new Error('Latest shell did not include a module entry script')
  }

  await import(src)
}

loadLatestPrymeLabsBuild().catch((error) => {
  console.error('Unable to recover from a stale Pryme Labs bundle reference.', error)
  window.location.replace(`/?pl_recover=${Date.now()}`)
})
