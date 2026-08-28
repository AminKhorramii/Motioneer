/**
 * Binding a port that is already answering.
 *
 * Every server here picks a number, and a number already in use throws EADDRINUSE out of an
 * asynchronous listen callback, which node reports as an unhandled error with a stack trace and no
 * suggestion. That is a poor way to learn that you left a studio running in another terminal, and it
 * is the common case rather than the rare one: two studios at once is a reasonable thing to want, one
 * pointed at a folder of components and one at a running app.
 *
 * So a taken port moves to the next one instead of stopping. The number that was asked for is still
 * tried first, and the caller is told which one it actually got, because a tool that says 4321 while
 * listening on 4322 is worse than one that crashes.
 *
 * Port zero is left alone. It means "whatever is free" to the operating system already, and the
 * suites depend on that: a leftover process from an earlier run cannot quietly answer in this one.
 */
export function listenNear(server, want, host, tries = 20) {
  return new Promise((resolve, reject) => {
    let port = Number(want) || 0
    let left = port === 0 ? 1 : tries

    const attempt = () => {
      const onError = (e) => {
        server.removeListener('error', onError)
        // anything that is not a busy port is a real failure and is not worth retrying
        if (e.code !== 'EADDRINUSE' || --left <= 0) return reject(e)
        port += 1
        attempt()
      }
      const onListening = () => {
        server.removeListener('error', onError)
        resolve(server.address().port)
      }
      server.once('error', onError)
      // host may be undefined, which listens on every interface, and node accepts that
      server.listen(port, host, onListening)
    }

    attempt()
  })
}

/** what to print when the port that was asked for was not the port that was got */
export const movedFrom = (got, want) =>
  (Number(want) && got !== Number(want) ? `  ${want} was busy, so this is on ${got} instead` : '')
