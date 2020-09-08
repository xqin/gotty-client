#!/usr/bin/env node

/*
const (
  // Unknown message type, maybe set by a bug
  UnknownOutput = '0'
  // Normal output to the terminal
  Output = '1'
  // Pong to the browser
  Pong = '2'
  // Set window title of the terminal
   = '3'
  // Set terminal preference
  SetPreferences = '4'
  // Make terminal to reconnect
  SetReconnect = '5'

  // Unknown message type, maybe sent by a bug
  UnknownInput = '0'
  // User input typically from a keyboard
  Input = '1'
  // Ping to the server
  Ping = '2'
  // Notify that the browser size has been changed
  ResizeTerminal = '3'
)
*/

(async () => {
  const [,, url] = process.argv

  if (/^https?:\/\/.+/.test(url) === false) {
    console.log("Usage: gotty-client 'gotty web url'")
    return
  }

  const http = require('request').defaults({
    timeout: 3000, // http request global timeout
    strictSSL: false // ignore ssl verify
  })

  const getAuthToken = (url) => new Promise((resolve, reject) => {
    url = `${url.replace(/\/$/, '')}/auth_token.js`

    console.log(`Fetching AuthToken By: ${url}`)

    http.get(url, (e, res, body) => {
      if (e) {
        return reject(e)
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Unknown status code: ${res.statusCode}`))
      }

      if (/var gotty_auth_token = '(.*)'/.test(body)) {
        return resolve(RegExp.$1)
      }

      reject(new Error('Cannot fetch GoTTY auth-token.'))
    })
  })

  const { URL } = require('url')

  const { protocol, search: Arguments, host, origin, pathname } = new URL(url)

  const AuthToken = await getAuthToken(`${origin}${pathname}`).catch((e) => {
    console.error('[getAuthToken]', e)
    return null
  })

  if (AuthToken === null) {
    return
  }

  console.log(`Auth-token: ${JSON.stringify(AuthToken)}`)

  const WebSocket = require('ws')

  const wsUrl = `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${pathname.replace(/\/$/, '')}/ws`

  console.log(`Connecting To Websocket Server: ${wsUrl}`)

  const ws = new WebSocket(wsUrl)

  const exit = (code = 0) => {
    ws.close()
    process.exit(code)
  }

  ws.on('open', function open () {
    process.stdin.setRawMode(true)
    process.stdin.resume()

    console.log('Sending arguments and auth-token')
    // Send Welcome Message
    ws.send(JSON.stringify({ Arguments, AuthToken }))

    const setSize = () => {
      const { columns, rows } = process.stdout

      ws.send(`3${JSON.stringify({ columns, rows })}`) // 设置窗口大小
    }

    process.stdout.on('resize', setSize)

    setSize()

    setInterval(() => {
      ws.send('2') // ping server
    }, 30000)

    process.stdin.on('data', data => {
      // console.log('Send', JSON.stringify(data.toString('hex')))

      ws.send(1 + data.toString('binary'))
    })
  })

  ws.on('close', () => {
    exit(0)
  })

  ws.on('error', (e) => {
    console.error('[WS]', e)
    exit(1)
  })

  ws.on('message', function incoming (data) {
    const cmd = data[0]
    const body = data.slice(1)
    const message = Buffer.from(body, 'base64')

    switch (cmd) {
      case '0': // UnknownOutput
        console.log('unknow ...')
        break
      case '1': // Output
        process.stdout.write(message)

        // console.log('Recv',
        //   JSON.stringify(message.toString('utf8')),
        //   message.toString('hex').toUpperCase().replace(/(..)/g, '$1 ')
        // )
        break
      case '2': // Pong
        break
      case '3': // SetWindowTitle
        console.log('SetWindowTitle', body)
        process.stdout.write(String.fromCharCode(27) + ']0;' + body + String.fromCharCode(7))
        break
      case '4': // SetPreferences
        console.log('SetPreferences', body)
        break
      default:
        process.stdout.write('unknow', cmd)
        break
    }
  })
})()
