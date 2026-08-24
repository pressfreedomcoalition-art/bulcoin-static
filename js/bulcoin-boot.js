;(function () {
        var pctEl = document.getElementById('app-boot-pct')
        var fillEl = document.getElementById('app-boot-fill')
        var textEl = document.getElementById('app-boot-text')
        var labelEl = document.getElementById('app-boot-label')
        var retryEl = document.getElementById('app-boot-retry')
        var cancelEl = document.getElementById('app-boot-cancel')
        var actionsEl = document.getElementById('app-boot-actions')
        var retryMetaEl = document.getElementById('app-boot-retry-meta')
        var verEl = document.getElementById('app-boot-ver')
        var logEl = document.getElementById('app-boot-log')
        var envEl = document.getElementById('app-boot-env')
        var bootTag = '20260824b'

        function apiUrl(p) {
          try {
            var o = window.__BULCOIN_API_ORIGIN__
            if (o) return String(o).replace(/\/+$/, '') + p
          } catch (eApi) {}
          return p
        }
        var value = 0
        var target = 10
        var finishing = false
        var failed = false
        var t0 = Date.now()
        var MAX_AUTO_RETRY = 10
        var autoRetryCancelled = false
        var autoRetryTimer = null
        var autoRetryN = 0
        var reportKeys = {}
        var tickTimer = null
        window.__BULCOIN_BOOT_STEPS = window.__BULCOIN_BOOT_STEPS || []
        // Mark boot UI live BEFORE any work — Tiny ES5 must stop its 88% false hang
        window.__BULCOIN_BOOT_UI = '1'
        // Second preloader: app.js download (CDN full GET + onprogress)
        window.__bulcoinBootDl = function (opts) {
          try {
            opts = opts || {}
            var box = document.getElementById('app-boot-dl')
            var nameEl = document.getElementById('app-boot-dl-name')
            var pctElDl = document.getElementById('app-boot-dl-pct')
            var fillElDl = document.getElementById('app-boot-dl-fill')
            if (!box) return
            if (opts.hide) {
              box.classList.remove('is-visible')
              return
            }
            box.classList.add('is-visible')
            var file = opts.file || 'app.js'
            var loaded = Math.max(0, Number(opts.loaded) || 0)
            var total = Math.max(0, Number(opts.total) || 0)
            if (!total && window.__BULCOIN_APP_BYTES__) {
              total = Number(window.__BULCOIN_APP_BYTES__) || 0
            }
            if (nameEl) nameEl.textContent = opts.error ? String(opts.error) : file
            var pct = 0
            if (total > 0) pct = Math.min(100, Math.round((loaded / total) * 100))
            else if (opts.done) pct = 100
            if (pctElDl) {
              if (total > 0 || opts.done) pctElDl.textContent = (pct < 1 && loaded > 0 && !opts.done ? 1 : pct) + '%'
              else pctElDl.textContent = '…'
            }
            if (fillElDl) fillElDl.style.width = (total > 0 || opts.done ? pct : Math.min(95, 8 + loaded / 12000)) + '%'
            if (textEl && !finishing && !failed && !opts.error && (total > 0 ? loaded < total : !opts.done)) {
              textEl.textContent = 'Загрузка приложения…'
            }
            if (labelEl && !failed && !finishing) labelEl.textContent = 'Скачивание'
          } catch (eDl) {}
        }
        // Early stub so Tiny ES5 stops capping even if the rest of this IIFE is slow
        window.__bulcoinBootProgress = function (next, message) {
          if (typeof next === 'number' && next > target) target = next
          if (message && textEl) textEl.textContent = message
        }
        // Never touch storage synchronously on Huawei — can freeze the HTML parser.
        window.setTimeout(function () {
          try {
            if (!sessionStorage.getItem('bulcoinErrSid')) {
              sessionStorage.setItem(
                'bulcoinErrSid',
                Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
              )
            }
          } catch (eSid) {}
        }, 0)

        function pushStep(step, detail) {
          var row = { t: Date.now(), step: step, detail: detail }
          window.__BULCOIN_BOOT_STEPS.push(row)
          while (window.__BULCOIN_BOOT_STEPS.length > 12) window.__BULCOIN_BOOT_STEPS.shift()
          window.__BULCOIN_BOOT_LAST = detail ? step + ':' + detail : step
          paintLog()
        }

        function paintLog(forceShow) {
          if (!logEl) return
          var steps = window.__BULCOIN_BOOT_STEPS || []
          var html = ''
          for (var i = Math.max(0, steps.length - 6); i < steps.length; i++) {
            var s = steps[i]
            var sec = ((s.t - t0) / 1000).toFixed(1)
            html +=
              '<li>+' +
              sec +
              's ' +
              s.step +
              (s.detail ? ' — ' + s.detail : '') +
              '</li>'
          }
          logEl.innerHTML = html
          if (forceShow || failed) {
            logEl.classList.add('is-visible')
          }
        }
        window.__bulcoinBootPaintLog = paintLog

        function statusFor(p) {
          if (p < 20) return 'Подготовка'
          if (p < 45) return 'Подключение'
          if (p < 70) return 'Загрузка'
          if (p < 92) return 'Почти готово'
          return 'Запуск'
        }

        function paint() {
          var shown = Math.max(0, Math.min(100, Math.round(value)))
          if (pctEl) pctEl.textContent = shown + '%'
          if (fillEl) fillEl.style.width = shown + '%'
          if (labelEl && !failed) labelEl.textContent = statusFor(shown)
        }

        function setBootCode(code) {
          if (!verEl) return
          verEl.textContent = code ? 'boot ' + bootTag + ' · ' + code : 'boot ' + bootTag
        }

        function trail() {
          var steps = window.__BULCOIN_BOOT_STEPS || []
          return steps
            .slice(-5)
            .map(function (s) {
              return s.step
            })
            .join(' → ')
        }

        function jsStatus() {
          try {
            if (window.__BULCOIN_JS_LOAD) return window.__BULCOIN_JS_LOAD
            var entry = window.__BULCOIN_APP_ENTRY__ || ''
            var file = entry ? entry.split('/').pop() : 'app.js'
            var htmlSrc = document.querySelector('script[data-bulcoin="html-src"]')
            var dynSrc = document.querySelector('script[data-bulcoin="src"]')
            if (htmlSrc || dynSrc) return file + ' src…'
            if (!entry) return 'нет entry JS'
            return file + ' — ждём загрузчик'
          } catch (e) {
            return ''
          }
        }

        function pendingAssets() {
          try {
            var entries = performance.getEntriesByType('resource') || []
            var pending = []
            for (var i = 0; i < entries.length; i++) {
              var e = entries[i]
              var name = e.name || ''
              if (!/\/(assets|js)\//.test(name)) continue
              if (e.responseEnd === 0) {
                var file = name.split('/').pop() || name
                pending.push(file.split('?')[0])
              }
            }
            return pending.slice(0, 3).join(', ')
          } catch (e) {
            return ''
          }
        }

        function collectEnv() {
          try {
            var ua = String(navigator.userAgent || '')
            var android = (ua.match(/Android\s([\d._]+)/i) || [])[1] || '-'
            var chrome = (ua.match(/Chrome\/([\d.]+)/i) || [])[1] || '-'
            var webview = /; wv\)|Version\/4\.0/i.test(ua) ? 'webview' : 'browser'
            var tgUa = (ua.match(/Telegram[\w.\/-]*/i) || [])[0] || '-'
            var tgApi = '-'
            var tgId = '-'
            var tgAuthAge = '-'
            var idataLen = 0
            var ios = (ua.match(/OS\s([\d_]+)/i) || [])[1] || ''
            if (ios) ios = ios.replace(/_/g, '.')
            try {
              var tw = window.Telegram && window.Telegram.WebApp
              if (tw) {
                idataLen = tw.initData ? String(tw.initData).length : 0
                tgApi =
                  'v' +
                  (tw.version || '?') +
                  ' plat=' +
                  (tw.platform || '?') +
                  ' idata=' +
                  idataLen
                if (tw.initDataUnsafe && tw.initDataUnsafe.user && tw.initDataUnsafe.user.id) {
                  tgId = String(tw.initDataUnsafe.user.id)
                }
                if (tw.initData) {
                  var ad = String(tw.initData).match(/(?:^|&)auth_date=(\d+)/)
                  if (ad) tgAuthAge = String(Math.round(Date.now() / 1000 - Number(ad[1]))) + 's'
                }
              }
            } catch (e0) {}
            if (tgId === '-') {
              try {
                var hashUser = (location.hash || '').match(/"id"\s*:\s*(\d+)/)
                if (hashUser) tgId = hashUser[1] + '(hash)'
              } catch (e0b) {}
            }
            var brand = '-'
            if (
              /Huawei|HUAWEI|Honor|HMSCore|Harmony/i.test(ua) ||
              /\b(MAR|MED|HMA|JNY|HLK|ANE|LYA|VOG|ELE|CLT|EML|LIO|NOH|ANA|ELS|TAS|LNA|CDY|STK|ART|DRA|AMN)-/i.test(
                ua
              )
            )
              brand = 'huawei/honor'
            else if (/Samsung|SM-/i.test(ua)) brand = 'samsung'
            else if (/Xiaomi|Redmi|Mi\s|POCO/i.test(ua)) brand = 'xiaomi'
            else if (/iPhone|iPad|iOS/i.test(ua)) brand = 'apple'
            else if (/Windows/i.test(ua)) brand = 'windows'
            var client = /Telegraph/i.test(ua) ? 'telegraph' : /Telegram/i.test(ua) ? 'telegram' : 'other'
            var conn = ''
            try {
              var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
              if (c) conn = (c.effectiveType || c.type || '') + (c.downlink ? ' ' + c.downlink + 'Mb' : '')
            } catch (e1) {}
            var mem = navigator.deviceMemory ? navigator.deviceMemory + 'GB' : '-'
            var cores = navigator.hardwareConcurrency || '-'
            var dpr = window.devicePixelRatio || 1
            var scr = (screen.width || 0) + 'x' + (screen.height || 0)
            var vp = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0)
            var moduleOk = false
            try {
              moduleOk = 'noModule' in document.createElement('script')
            } catch (e2) {}
            var evalOk = '-'
            try {
              evalOk = (0, eval)('1') === 1 ? 'yes' : 'no'
            } catch (e3) {
              evalOk = 'no:' + String((e3 && e3.message) || e3).slice(0, 24)
            }
            var perfOk = typeof performance !== 'undefined' && typeof performance.now === 'function'
            var resHint = ''
            try {
              if (perfOk && performance.getEntriesByType) {
                var list = performance.getEntriesByType('resource') || []
                var js = null
                for (var i = list.length - 1; i >= 0; i--) {
                  if (/\.js(\?|$)/.test(list[i].name || '')) {
                    js = list[i]
                    break
                  }
                }
                if (js) {
                  resHint =
                    'jsTransfer=' +
                    Math.round(js.transferSize || 0) +
                    'b dur=' +
                    Math.round(js.duration || 0) +
                    'ms'
                } else {
                  resHint = 'jsResource=none'
                }
              } else {
                resHint = 'perfAPI=broken'
              }
            } catch (e4) {
              resHint = 'perfAPI=err'
            }
            var htmlSrc = document.querySelector('script[data-bulcoin="html-src"]')
            var dynSrc = document.querySelector('script[data-bulcoin="src"]')
            var lastTg = '-'
            try {
              lastTg = localStorage.getItem('bulcoinLastTgId') || '-'
            } catch (e5) {}
            return [
              'stamp=' + bootTag + ' brand=' + brand + (ios ? ' ios=' + ios : ''),
              'android=' + android + ' chrome=' + chrome + ' ' + webview,
              'client=' + client + ' tgUa=' + tgUa,
              'tgId=' + tgId + ' lastTg=' + lastTg + ' authAge=' + tgAuthAge,
              'tgApi=' + tgApi,
              'screen=' + scr + ' vp=' + vp + ' dpr=' + dpr,
              'net=' + (conn || '-') + ' online=' + (navigator.onLine ? '1' : '0'),
              'mem=' + mem + ' cores=' + cores + ' lang=' + (navigator.language || '-'),
              'module=' + (moduleOk ? '1' : '0') + ' eval=' + evalOk + ' perf=' + (perfOk ? '1' : '0'),
              'load=' + (window.__BULCOIN_JS_LOAD || '-'),
              'exec=' + (window.__BULCOIN_JS_EXEC || '0') + ' react=' + (window.__BULCOIN_REACT || '0'),
              'entry=' + String(window.__BULCOIN_APP_ENTRY__ || '').split('/').pop(),
              'tags=htmlSrc:' + (htmlSrc ? '1' : '0') + ' dynSrc:' + (dynSrc ? '1' : '0'),
              resHint,
              'ua=' + ua.slice(0, 140),
            ].join('\n')
          } catch (e) {
            return 'env-error:' + String((e && e.message) || e)
          }
        }
        window.__bulcoinBootEnv = collectEnv

        function paintEnv() {
          if (!envEl) return
          envEl.textContent = collectEnv()
          envEl.classList.add('is-visible')
        }

        function sessionId() {
          try {
            return sessionStorage.getItem('bulcoinErrSid') || ''
          } catch (e) {
            return ''
          }
        }

        function tgBits() {
          var out = { tgUserId: '', platform: '' }
          try {
            var tw = window.Telegram && window.Telegram.WebApp
            if (tw) {
              out.platform = String(tw.platform || '')
              if (tw.initDataUnsafe && tw.initDataUnsafe.user && tw.initDataUnsafe.user.id) {
                out.tgUserId = String(tw.initDataUnsafe.user.id)
              }
            }
            if (!out.tgUserId) {
              var m = (location.hash || '').match(/"id"\s*:\s*(\d+)/)
              if (m) out.tgUserId = m[1]
            }
          } catch (e2) {}
          return out
        }

        /** Diagnostic "screenshot": always works (text→canvas JPEG). Real DOM capture is unreliable in TG WebView. */
        function buildDiagShot() {
          try {
            var c = document.createElement('canvas')
            c.width = 360
            c.height = 640
            var ctx = c.getContext && c.getContext('2d')
            if (!ctx) return ''
            ctx.fillStyle = '#131211'
            ctx.fillRect(0, 0, 360, 640)
            ctx.fillStyle = '#f2e983'
            ctx.font = 'bold 14px monospace'
            ctx.fillText('BulCoin boot ' + bootTag, 10, 22)
            ctx.fillStyle = '#ffffff'
            ctx.font = '11px monospace'
            var blob =
              (textEl && textEl.textContent ? textEl.textContent + '\n' : '') +
              (verEl && verEl.textContent ? verEl.textContent + '\n' : '') +
              collectEnv()
            var lines = String(blob).split('\n')
            var y = 42
            for (var i = 0; i < lines.length && y < 620; i++) {
              ctx.fillText(String(lines[i]).slice(0, 52), 10, y)
              y += 13
            }
            return c.toDataURL('image/jpeg', 0.55)
          } catch (eShot) {
            return ''
          }
        }

        /**
         * Ultra-compatible error report: sendBeacon → XHR → Image beacon.
         * Must not throw; safe to call before React.
         */
        function reportClientError(payload) {
          try {
            var key = String((payload && payload.code) || 'E') + ':' + String((payload && payload.retry) || 0)
            if (reportKeys[key]) return
            reportKeys[key] = 1
            var tg = tgBits()
            var body = {
              kind: (payload && payload.kind) || 'boot',
              code: (payload && payload.code) || 'E_UNKNOWN',
              message: (payload && payload.message) || '',
              boot: bootTag,
              url: String(location.href || '').slice(0, 400),
              ua: String(navigator.userAgent || '').slice(0, 240),
              online: navigator.onLine !== false,
              retry: payload && typeof payload.retry === 'number' ? payload.retry : null,
              maxRetry: MAX_AUTO_RETRY,
              sessionId: sessionId(),
              tgUserId: tg.tgUserId,
              platform: tg.platform,
              steps: (window.__BULCOIN_BOOT_STEPS || []).slice(-16),
              envText: collectEnv(),
              lastJsErr: String(window.__BULCOIN_LAST_JS_ERR || '').slice(0, 400),
              jsLoad: String(window.__BULCOIN_JS_LOAD || ''),
              jsExec: String(window.__BULCOIN_JS_EXEC || ''),
              react: String(window.__BULCOIN_REACT || ''),
              shot: (payload && payload.shot) || buildDiagShot(),
              clientTs: Date.now(),
              extra: (payload && payload.extra) || {},
            }
            var json = JSON.stringify(body)
            var sent = false
            try {
              if (navigator.sendBeacon) {
                sent = navigator.sendBeacon(
                  apiUrl('/api/client-errors'),
                  new Blob([json], { type: 'application/json' })
                )
              }
            } catch (eB) {}
            if (!sent) {
              try {
                var xhr = new XMLHttpRequest()
                xhr.open('POST', apiUrl('/api/client-errors'), true)
                xhr.setRequestHeader('Content-Type', 'application/json')
                xhr.timeout = 8000
                xhr.send(json)
                sent = true
              } catch (eX) {}
            }
            if (!sent) {
              try {
                var img = new Image()
                img.src =
                  apiUrl('/api/client-errors/beacon?c=') +
                  encodeURIComponent(body.code) +
                  '&m=' +
                  encodeURIComponent(body.message.slice(0, 120)) +
                  '&b=' +
                  encodeURIComponent(bootTag) +
                  '&r=' +
                  encodeURIComponent(String(body.retry == null ? '' : body.retry)) +
                  '&s=' +
                  encodeURIComponent(body.sessionId) +
                  '&u=' +
                  encodeURIComponent(body.url.slice(0, 120)) +
                  '&_=' +
                  Date.now()
              } catch (eI) {}
            }
            pushStep('err-report', body.code)
          } catch (eR) {}
        }
        window.__bulcoinReportError = reportClientError

        function hardReload(reason) {
          try {
            // Never navigate away mid-download — WebView dies with net::ERR_HTTP2_PING_FAILED
            if (window.__BULCOIN_XHR_MAIN === '1' && window.__BULCOIN_REACT !== '1') {
              pushStep('reload:blocked-dl', String(reason || ''))
              try {
                if (typeof window.__bulcoinRetryAppDl === 'function') window.__bulcoinRetryAppDl('reload-blocked')
              } catch (eRb) {}
              return
            }
            // Keep __telegram__* session keys — wiping them on retry caused E_TG
            // ("Invalid Telegram init data") on Huawei after the first hang.
            var u = new URL(window.location.href)
            u.searchParams.set('v', String(Date.now()))
            u.searchParams.set('boot', bootTag)
            u.searchParams.set('acct', '1')
            u.searchParams.set('retry', String(autoRetryN))
            if (reason) u.searchParams.set('why', String(reason).slice(0, 40))
            window.location.replace(u.toString())
          } catch (e) {
            window.location.reload()
          }
        }

        function setRetryMeta(text) {
          if (retryMetaEl) retryMetaEl.textContent = text || ''
        }

        function stopAutoRetry(reason) {
          autoRetryCancelled = true
          if (autoRetryTimer) {
            window.clearTimeout(autoRetryTimer)
            autoRetryTimer = null
          }
          try {
            sessionStorage.setItem('bulcoinAutoRetryCancel', '1')
          } catch (eStop) {}
          pushStep('auto-retry:stop', reason || 'cancel')
          setRetryMeta(
            reason === 'max'
              ? 'Автоповторы исчерпаны (10/10). Можно повторить вручную или закрыть.'
              : 'Автоповторы остановлены. Можно закрыть приложение.'
          )
        }
        window.__bulcoinCancelAutoRetry = stopAutoRetry
        window.__bulcoinCloseApp = function () {
          stopAutoRetry('close')
          reportClientError({ kind: 'boot', code: 'E_CANCEL', message: 'close app', retry: -2 })
          try {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.close) {
              window.Telegram.WebApp.close()
              return true
            }
          } catch (eCl) {}
          return false
        }

        function scheduleAutoRetry(code) {
          try {
            if (sessionStorage.getItem('bulcoinAutoRetryCancel') === '1') {
              autoRetryCancelled = true
              setRetryMeta('Автоповторы остановлены ранее.')
              return
            }
          } catch (eCan) {}
          if (autoRetryCancelled) return
          try {
            var prev = Number(sessionStorage.getItem('bulcoinAutoRetry') || '0')
            autoRetryN = isFinite(prev) ? prev : 0
          } catch (eP) {
            autoRetryN = 0
          }
          if (autoRetryN >= MAX_AUTO_RETRY) {
            stopAutoRetry('max')
            return
          }
          var next = autoRetryN + 1
          var waitMs = Math.min(12000, 1500 + autoRetryN * 900)
          setRetryMeta(
            'Автоповтор ' + next + '/' + MAX_AUTO_RETRY + ' через ' + Math.round(waitMs / 1000) + 'с… (Отмена — остановить)'
          )
          pushStep('auto-retry:wait', next + '/' + MAX_AUTO_RETRY)
          autoRetryTimer = window.setTimeout(function () {
            if (autoRetryCancelled || window.__BULCOIN_REACT === '1') return
            if (
              window.__BULCOIN_XHR_MAIN === '1' ||
              (/E_JS|E_NOEXEC|E_NOREACT|E_EXEC|E_THROW|chunk|xhr/i.test(String(code || '')) &&
                typeof window.__bulcoinRetryAppDl === 'function')
            ) {
              pushStep('auto-retry:inplace', String(next))
              try {
                if (typeof window.__bulcoinRetryAppDl === 'function') window.__bulcoinRetryAppDl('auto-retry')
              } catch (eIp) {}
              return
            }
            try {
              sessionStorage.setItem('bulcoinAutoRetry', String(next))
            } catch (eS) {}
            reportClientError({
              kind: 'boot-retry',
              code: (code || 'E_FAIL') + ':retry',
              message: 'auto-retry ' + next + '/' + MAX_AUTO_RETRY,
              retry: next,
            })
            hardReload('auto-retry-' + next)
          }, waitMs)
        }

        function showRetry(msg, code) {
          if (failed) return
          failed = true
          window.__BULCOIN_BOOT_FAILED = '1'
          pushStep(code || 'E_FAIL', msg)
          if (textEl && msg) textEl.textContent = msg
          if (code) setBootCode(code + (trail() ? ' · ' + trail() : ''))
          if (actionsEl) actionsEl.classList.add('is-visible')
          if (labelEl) labelEl.textContent = 'Ошибка'
          paintLog(true)
          paintEnv()
          // Report + auto-retry in parallel (report must not block retries)
          reportClientError({ kind: 'boot', code: code || 'E_FAIL', message: msg || '', retry: 0 })
          scheduleAutoRetry(code || 'E_FAIL')
        }
        window.__bulcoinBootShowError = showRetry

        function tick() {
          if (failed) {
            paint()
            return
          }
          if (finishing) {
            value += Math.max(1.2, (100 - value) * 0.22)
            if (value >= 99.5) value = 100
          } else if (value < target) {
            value += Math.max(0.35, (target - value) * 0.08)
          } else if (window.__BULCOIN_REACT === '1' && value < 88) {
            // React up but gate/API slow — never freeze on old 48% nudge ceiling
            target = Math.min(88, Math.max(target, value) + 0.5)
            value += 0.3
          } else if (
            value < 72 &&
            !/module load|import|imported|classic|eval|inline|src-/i.test(
              String(window.__BULCOIN_JS_LOAD || '')
            )
          ) {
            // Soft-cap below "almost done" while still downloading — never idle at 85%
            target = Math.min(72, target + 0.1)
            value += 0.08
          }
          paint()
          if (finishing && value >= 100 && tickTimer) {
            window.clearInterval(tickTimer)
            tickTimer = null
          }
        }

        // Huawei/Android TG WebView often never fires rAF → stuck at 0%.
        // Drive progress with setInterval (always works); rAF is optional bonus.
        function startTick() {
          if (tickTimer) return
          tick()
          tickTimer = window.setInterval(tick, 50)
          try {
            if (typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(function rafBoost() {
                tick()
                if (!failed && !(finishing && value >= 100)) {
                  window.requestAnimationFrame(rafBoost)
                }
              })
            }
          } catch (eRaf) {}
        }

        window.__bulcoinBootMessage = function (message) {
          if (message && textEl && !finishing && !failed) textEl.textContent = message
        }
        window.__bulcoinBootProgress = function (next, message) {
          if (typeof next === 'number' && next > target) target = Math.min(96, next)
          if (message) window.__bulcoinBootMessage(message)
        }
        window.__bulcoinBootMessage = function (message) {
          if (message && textEl && !finishing && !failed) textEl.textContent = message
        }
        window.__bulcoinBootFinish = function () {
          if (failed) return
          finishing = true
          window.__BULCOIN_BOOT_OK = '1'
          target = 100
          if (textEl) textEl.textContent = 'Готово'
          if (labelEl) labelEl.textContent = 'Готово'
          if (actionsEl) actionsEl.classList.remove('is-visible')
          try {
            sessionStorage.removeItem('bulcoinAutoRetry')
            sessionStorage.removeItem('bulcoinAutoRetryCancel')
          } catch (eDone) {}
          pushStep('done', 'Готово')
        }

        pushStep('html', 'HTML готов')
        if (window.__BULCOIN_FORCE_NOCACHE) {
          pushStep('nocache', 'soft')
          setBootCode('nocache')
          // Do NOT wipe __telegram__initParams here — kills auth on Huawei after soft bust
        }
        window.__bulcoinBootProgress(14, 'Загрузка…')
        startTick()

        // Stuck at 0% with no JS progress → report + hard fail early (Huawei)
        window.setTimeout(function () {
          if (failed || window.__BULCOIN_REACT === '1') return
          if (value < 1) {
            pushStep('stuck0', 'value=' + value)
            reportClientError({
              kind: 'boot',
              code: 'E_STUCK0',
              message: 'progress stuck at 0% (rAF/interval?)',
              retry: 0,
              extra: { jsLoad: String(window.__BULCOIN_JS_LOAD || ''), entry: String(window.__BULCOIN_APP_ENTRY__ || '') },
            })
          }
        }, 4000)
        window.setTimeout(function () {
          if (failed || window.__BULCOIN_REACT === '1') return
          if (value < 2 && !window.__BULCOIN_JS_EXEC) {
            showRetry(
              'Загрузка зависла на старте (0%). Нажмите «Повторить» или дождитесь автоповтора.',
              'E_STUCK0'
            )
          }
        }, 8000)
        // Classic Huawei hang: React flagged, bar frozen ~48%, splash never hides
        window.setTimeout(function () {
          if (failed || finishing) return
          var boot = document.getElementById('app-boot')
          if (!boot || boot.classList.contains('app-boot--hide')) return
          if (window.__BULCOIN_REACT !== '1') return
          if (value < 40 || value > 72) return
          pushStep('stuck48', 'v=' + Math.round(value))
          reportClientError({
            kind: 'boot',
            code: 'E_STUCK48',
            message: 'stuck near 48% after React',
            retry: 0,
            extra: {
              last: String(window.__BULCOIN_BOOT_LAST || ''),
              jsLoad: String(window.__BULCOIN_JS_LOAD || ''),
            },
          })
          target = Math.max(target, 75)
          if (textEl) textEl.textContent = 'Ещё подключаем…'
          paintLog(true)
          paintEnv()
        }, 10000)
        window.setTimeout(function () {
          if (failed || finishing) return
          var boot = document.getElementById('app-boot')
          if (!boot || boot.classList.contains('app-boot--hide')) return
          if (window.__BULCOIN_REACT === '1' && value < 92) {
            showRetry(
              'Зависли на подключении (' +
                Math.round(value) +
                '%). Нажмите «Повторить» или дождитесь автоповтора.',
              'E_STUCK48'
            )
          }
        }, 18000)

        function clearTelegramStaleStorage(reason) {
          try {
            var keys = []
            for (var i = 0; i < sessionStorage.length; i++) {
              var k = sessionStorage.key(i)
              if (k && k.indexOf('__telegram__') === 0) keys.push(k)
            }
            for (var j = 0; j < keys.length; j++) sessionStorage.removeItem(keys[j])
            pushStep('tg-storage:clear', reason || String(keys.length))
          } catch (eClr) {}
        }
        window.__bulcoinClearTgStorage = clearTelegramStaleStorage

        // Per-account hang: Telegram reuses stale __telegram__initParams per WebView profile
        function syncAccountStorage(reason) {
          try {
            var uid = ''
            var tw = window.Telegram && window.Telegram.WebApp
            if (tw && tw.initDataUnsafe && tw.initDataUnsafe.user && tw.initDataUnsafe.user.id) {
              uid = String(tw.initDataUnsafe.user.id)
            }
            if (!uid) {
              var m = (location.hash || '').match(/"id"\s*:\s*(\d+)/)
              if (m) uid = m[1]
            }
            if (!uid) return
            var prev = localStorage.getItem('bulcoinLastTgId') || ''
            if (prev && prev !== uid) {
              clearTelegramStaleStorage('acct-switch:' + prev + '→' + uid)
            }
            localStorage.setItem('bulcoinLastTgId', uid)
            // After successful boot, do not overwrite BOOT_LAST (false E_GATE trail)
            if (window.__BULCOIN_BOOT_OK === '1' || finishing) return
            var prevLast = String(window.__BULCOIN_BOOT_LAST || '')
            // Keep api:/warm:/gate: visible in E_GATE — tg-acct:late at 2s was misleading on slow RF
            if (/^(api:|warm:|gate:|tg:ok)/.test(prevLast)) return
            pushStep('tg-acct', (reason ? reason + ':' : '') + uid)
          } catch (eAcc) {}
        }
        // Defer storage — sync localStorage has frozen Huawei WebViews mid-parse
        window.setTimeout(function () {
          syncAccountStorage('early')
        }, 0)
        window.setTimeout(function () {
          syncAccountStorage('sdk')
        }, 400)
        window.setTimeout(function () {
          syncAccountStorage('late')
        }, 2000)

        if (retryEl) {
          retryEl.addEventListener('click', function () {
            stopAutoRetry('manual')
            reportClientError({ kind: 'boot', code: 'E_MANUAL_RETRY', message: 'user retry', retry: -1 })
            hardReload('manual-retry')
          })
        }
        if (cancelEl) {
          cancelEl.addEventListener('click', function () {
            stopAutoRetry('cancel')
            reportClientError({ kind: 'boot', code: 'E_CANCEL', message: 'user cancel+close', retry: -2 })
            try {
              if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.close) {
                window.Telegram.WebApp.close()
                return
              }
            } catch (eC) {}
            setRetryMeta('Закройте окно Mini App вручную.')
          })
        }
        // Resume countdown label after forced reload mid-retry chain
        try {
          var ar = Number(sessionStorage.getItem('bulcoinAutoRetry') || '0')
          if (ar > 0 && ar < MAX_AUTO_RETRY) {
            setRetryMeta('Продолжение автоповторов: уже ' + ar + '/' + MAX_AUTO_RETRY)
          }
        } catch (eAr) {}

        window.addEventListener(
          'error',
          function (ev) {
            if (ev && ev.target && (ev.target.tagName === 'SCRIPT' || ev.target.tagName === 'LINK')) {
              var src = ev.target.src || ev.target.href || ''
              var file = ''
              try {
                file = src ? new URL(src, location.href).pathname.split('/').pop() : ''
              } catch (e) {}
              pushStep('asset-error', file || 'unknown')
              showRetry(
                'Не загрузился файл' + (file ? ': ' + file : '') + '. Нажмите «Повторить».',
                file ? 'E_ASSET:' + file : 'E_ASSET'
              )
              try {
                window.__bulcoinBootTg && window.__bulcoinBootTg()
              } catch (e2) {}
            }
          },
          true
        )

        window.addEventListener('unhandledrejection', function (ev) {
          var reason = ev && ev.reason
          var msg = reason && reason.message ? reason.message : String(reason || 'promise')
          pushStep('unhandled', msg.slice(0, 80))
        })

        window.addEventListener('error', function (ev) {
          if (ev && ev.message && !ev.target) {
            pushStep('onerror', String(ev.message).slice(0, 70))
          }
        })

        function watchScript(sel, label) {
          var tries = 0
          function arm() {
            var el = document.querySelector(sel)
            if (!el) {
              tries += 1
              if (tries < 40) {
                window.setTimeout(arm, 50)
                return
              }
              pushStep(label + ':missing')
              return
            }
            pushStep(label + ':start', (el.src || el.href || '').split('/').pop() || '')
            el.addEventListener('load', function () {
              pushStep(label + ':ok')
            })
            el.addEventListener('error', function () {
              pushStep(label + ':fail')
              showRetry('Ошибка ' + label + '. Нажмите «Повторить».', 'E_' + label.toUpperCase())
            })
          }
          arm()
        }
        watchScript('link[rel="stylesheet"][href*="/assets/"]', 'css')
        watchScript('script[src*="telegram-web-app"]', 'sdk')
        // appjs is loaded via classic XHR — status in __BULCOIN_JS_LOAD

        // Huawei WebView often never fires link.onload for media=print stylesheets,
        // so Tailwind stays print-only and the UI paints unstyled (huge BLC icons).
        ;(function forceCssMediaAll() {
          function apply() {
            var nodes = document.querySelectorAll('link[rel="stylesheet"]')
            for (var i = 0; i < nodes.length; i++) {
              var l = nodes[i]
              if (l && l.media === 'print') {
                l.media = 'all'
                pushStep('css:media-all')
              }
            }
          }
          apply()
          window.setTimeout(apply, 0)
          window.setTimeout(apply, 400)
          window.setTimeout(apply, 1500)
          window.setTimeout(apply, 4000)
          try {
            var mo = new MutationObserver(apply)
            mo.observe(document.documentElement, { childList: true, subtree: true })
            window.setTimeout(function () {
              try {
                mo.disconnect()
              } catch (e) {}
            }, 20000)
          } catch (e) {}
        })()

        window.addEventListener('load', function () {
          pushStep('window.load')
        })

        // Fonts only after splash is gone — Outfit FOUT was shifting the boot "B"
        window.__bulcoinLoadFonts = function () {
          if (window.__BULCOIN_FONTS) return
          window.__BULCOIN_FONTS = '1'
          var l = document.createElement('link')
          l.rel = 'stylesheet'
          l.href =
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap'
          document.head.appendChild(l)
        }

        // Heartbeat while waiting for React
        var hb = 0
        var execWait = 0
        var hbId = window.setInterval(function () {
          hb += 1
          var boot = document.getElementById('app-boot')
          if (!boot || boot.classList.contains('app-boot--hide') || failed) {
            window.clearInterval(hbId)
            return
          }
          if (window.__BULCOIN_REACT) {
            if (!window.__BULCOIN_BOOT_LAST || String(window.__BULCOIN_BOOT_LAST).indexOf('react:') === 0) {
              pushStep('react:alive', '+' + hb + 's')
            }
            window.clearInterval(hbId)
            return
          }
          var st = jsStatus()
          pushStep('wait-js', st || '+' + hb + 's')
          if (textEl && !finishing) {
            textEl.textContent = st ? 'JS: ' + st : 'Ждём приложение… (' + hb + 'с)'
          }
          var load = String(window.__BULCOIN_JS_LOAD || '')
          var hasHtmlSrc = !!document.querySelector(
            'script[data-bulcoin="html-src"],script[data-bulcoin="src"]',
          )
          // Soft bump only during early XHR — never fake 85% after download
          if (
            typeof window.__bulcoinBootProgress === 'function' &&
            (!load || /XHR…|скачивание|ждём/.test(load)) &&
            !/module load|import|imported|classic|eval|inline|src|html-src|rescue/i.test(load)
          ) {
            window.__bulcoinBootProgress(Math.min(40, 18 + hb * 2), undefined)
          }
          // Huawei: html-src… / src… never matched old src- regex → execWait stuck at 0 forever
          var waitingExec =
            !!window.__BULCOIN_JS_PARSING ||
            /html-src|src…|src\.\.\.|src-|module load|import…|imported|classic|eval|inline|hb-rescue|xhr-rescue|xhr|XHR/i.test(
              load
            ) ||
            /src/i.test(load)
          if (waitingExec && !window.__BULCOIN_JS_EXEC && !window.__BULCOIN_REACT) {
            execWait += 1
            // Main bar stays at ~88%; separate file counter below shows real KB progress
            if (textEl && !finishing && (hasHtmlSrc || /src|html-src|скачивание|xhr|cdn/i.test(load))) {
              textEl.textContent = 'Загрузка приложения…'
              if (labelEl && !failed) labelEl.textContent = 'Скачивание'
              if (typeof window.__bulcoinBootProgress === 'function' && value < 85) {
                window.__bulcoinBootProgress(Math.min(85, 50 + Math.min(execWait, 30)), undefined)
              }
            }
            // Beacon so Huawei slow-download shows up in digest (not silent 88%)
            if (execWait === 45 || execWait === 90) {
              try {
                reportClientError({
                  kind: 'boot',
                  code: 'E_SLOW_JS',
                  message: 'still downloading app js @' + execWait + 's ' + load,
                  retry: 0,
                  extra: { jsLoad: load, entry: String(window.__BULCOIN_APP_ENTRY__ || '') },
                })
              } catch (eSl) {}
            }
            // Don't start a second XHR while primary progress XHR is already downloading
            var rescueAt = hasHtmlSrc || window.__BULCOIN_XHR_MAIN === '1' ? 90 : 8
            var failAt = hasHtmlSrc || window.__BULCOIN_XHR_MAIN === '1' ? 150 : 25
            if (
              execWait === rescueAt &&
              !window.__BULCOIN_XHR_RESCUE &&
              window.__BULCOIN_XHR_MAIN !== '1'
            ) {
              window.__BULCOIN_XHR_RESCUE = '1'
              try {
                var ent = window.__BULCOIN_APP_ENTRY__
                if (ent && typeof XMLHttpRequest !== 'undefined') {
                  pushStep('appjs:xhr-rescue', hasHtmlSrc ? 'late' : 'early')
                  window.__BULCOIN_JS_LOAD =
                    (String(ent).split('/').pop() || 'app.js') + ' xhr-rescue…'
                  var xhr = new XMLHttpRequest()
                  var url = ent.indexOf('http') === 0 ? ent : new URL(ent, location.href).href
                  xhr.open('GET', url, true)
                  xhr.timeout = 180000
                  xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return
                    if (window.__BULCOIN_JS_EXEC || window.__BULCOIN_REACT === '1') return
                    if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
                      try {
                        window.__BULCOIN_JS_LOAD =
                          (String(ent).split('/').pop() || 'app.js') + ' xhr-eval…'
                        ;(0, eval)(xhr.responseText)
                        try {
                          window.__BULCOIN_LAST_JS_ERR = ''
                        } catch (eClr) {}
                        pushStep('appjs:xhr-eval-ok')
                      } catch (eEv) {
                        window.__BULCOIN_LAST_JS_ERR = String(
                          (eEv && eEv.message) || eEv || 'eval'
                        )
                        pushStep('appjs:xhr-eval-fail', window.__BULCOIN_LAST_JS_ERR.slice(0, 80))
                      }
                    } else {
                      pushStep('appjs:xhr-rescue-http', String(xhr.status || 0))
                    }
                  }
                  xhr.send()
                }
              } catch (eXr) {}
            }
            if (execWait >= failAt) {
              showRetry(
                'JS не выполнился в WebView (' + load + '). Нажмите «Повторить».',
                window.__BULCOIN_LAST_JS_ERR ? 'E_THROW' : 'E_NOEXEC'
              )
              window.clearInterval(hbId)
            }
          } else if (
            // "ждём загрузчик" = entry known but boot IIFE never set JS_LOAD (Huawei)
            /ждём загрузчик/.test(st || '') &&
            !window.__BULCOIN_JS_EXEC &&
            hb >= 3
          ) {
            try {
              var ent2 = window.__BULCOIN_APP_ENTRY__
              if (
                ent2 &&
                !document.querySelector('script[data-bulcoin="html-src"],script[data-bulcoin="src"]')
              ) {
                var rs = document.createElement('script')
                rs.src = ent2.indexOf('http') === 0 ? ent2 : new URL(ent2, location.href).href
                rs.defer = true
                rs.setAttribute('data-bulcoin', 'src')
                document.head.appendChild(rs)
                window.__BULCOIN_JS_LOAD = (ent2.split('/').pop() || 'app.js') + ' hb-rescue…'
                pushStep('appjs:hb-rescue')
              }
            } catch (eR) {}
          } else if (
            // Native script src in progress is OK — do NOT fail on "src…" (slow Huawei)
            (!load || /pending|скачивание 0\/|XHR…|ждём загрузчик/.test(load)) &&
            !/src/i.test(load) &&
            !window.__BULCOIN_JS_EXEC &&
            hb >= 30
          ) {
            showRetry(
              'JS долго не скачивается (' + (load || 'нет статуса') + '). Нажмите «Повторить».',
              'E_JS'
            )
            window.clearInterval(hbId)
          } else if (window.__BULCOIN_JS_EXEC || window.__BULCOIN_REACT) {
            execWait = 0
          }
        }, 1000)

        // Hard fail — ~1MB classic script on ~2–12KB/s Wi‑Fi needs minutes, not 75s.
        // Extend while a live <script defer> / pending resource is still downloading.
        var hardFailExt = 0
        function armHardFailJs() {
          window.setTimeout(
            function () {
              var boot = document.getElementById('app-boot')
              if (!boot || boot.classList.contains('app-boot--hide') || failed) return
              if (window.__BULCOIN_REACT) return
              var st = jsStatus()
              var pending = pendingAssets()
              var stillDl =
                !!pending ||
                window.__BULCOIN_XHR_MAIN === '1' ||
                !!document.querySelector(
                  'script[data-bulcoin="html-src"],script[data-bulcoin="src"]',
                ) ||
                /src…|html-src|скачивание|xhr|Догружаем|Качаем/i.test(String(st || ''))
              if (stillDl && hardFailExt < 12) {
                hardFailExt += 1
                pushStep('hard-fail:extend', hardFailExt + '/12')
                if (textEl && !finishing) {
                  textEl.textContent =
                    'Качаем файл… смотрите счётчик ниже (' +
                    (75 + hardFailExt * 60) +
                    'с)'
                }
                armHardFailJs()
                return
              }
              showRetry(
                'JS не запустился: ' + (st || 'нет статуса') + '. Нажмите «Повторить».',
                /module load|import/i.test(String(st || '')) ? 'E_EXEC' : 'E_JS'
              )
            },
            hardFailExt === 0 ? 75000 : 60000,
          )
        }
        armHardFailJs()

        window.setTimeout(function () {
          var boot = document.getElementById('app-boot')
          if (!boot || boot.classList.contains('app-boot--hide') || failed) return
          // App already entered — never emit false E_GATE after done/tg-acct
          if (window.__BULCOIN_BOOT_OK === '1' || finishing) return
          var last = String(window.__BULCOIN_BOOT_LAST || '')
          if (/^done\b|gate:done|gate:onboarding|gate:finish/i.test(last)) return
          if (window.__BULCOIN_REACT) {
            try {
              if (typeof window.__bulcoinBootFail === 'function') {
                window.__bulcoinBootFail('E_GATE:' + (last || 'gate'))
                return
              }
            } catch (e) {}
          }
          showRetry(
            'Долгая загрузка на шаге: ' +
              (last || 'unknown') +
              '. Нажмите «Повторить».',
            window.__BULCOIN_REACT ? 'E_GATE' : 'E_SLOW'
          )
        }, 80000)
      })()

;(function () {
        function step(name, detail) {
          try {
            window.__BULCOIN_BOOT_STEPS = window.__BULCOIN_BOOT_STEPS || []
            window.__BULCOIN_BOOT_STEPS.push({ t: Date.now(), step: name, detail: detail })
            window.__BULCOIN_BOOT_LAST = detail ? name + ':' + detail : name
            window.__bulcoinBootPaintLog && window.__bulcoinBootPaintLog()
          } catch (e) {}
        }

        function absUrl(u) {
          return u.indexOf('http') === 0 ? u : new URL(u, location.href).href
        }

        function reactOk() {
          return window.__BULCOIN_REACT === '1'
        }

        var entry = window.__BULCOIN_APP_ENTRY__
        if (!entry) {
          if (location.port === '5173' || /\/src\//.test(location.pathname)) {
            step('appjs:dev-skip')
            return
          }
          window.__BULCOIN_JS_LOAD = 'нет entry'
          step('appjs:noentry')
          window.__bulcoinBootShowError &&
            window.__bulcoinBootShowError('Нет URL приложения. Нажмите «Повторить».', 'E_NOENTRY')
          return
        }

        if (/\/src\/main\./.test(entry)) {
          step('appjs:dev', entry)
          var dev = document.createElement('script')
          dev.type = 'module'
          dev.src = entry
          document.head.appendChild(dev)
          return
        }

        var file = String(entry).split('/').pop() || 'app.js'
        var entryAbs = absUrl(entry)
        var lastErr = ''
        var srcStarted = !!document.querySelector('script[data-bulcoin="html-src"]')
        var xhrStarted = false

        function armErrors() {
          window.onerror = function (msg, src, line, col, err) {
            lastErr = String((err && err.message) || msg || 'error')
            window.__BULCOIN_LAST_JS_ERR = lastErr
            step('appjs:throw', lastErr.slice(0, 140))
            return false
          }
          window.onunhandledrejection = function (ev) {
            try {
              lastErr = String((ev && ev.reason && ev.reason.message) || ev.reason || 'reject')
              window.__BULCOIN_LAST_JS_ERR = lastErr
              step('appjs:reject', lastErr.slice(0, 140))
            } catch (e4) {}
          }
        }

        function failNoReact(kind) {
          if (reactOk()) return
          var detail = lastErr || window.__BULCOIN_LAST_JS_ERR || ''
          var exec = window.__BULCOIN_JS_EXEC || ''
          window.__BULCOIN_JS_LOAD = file + ' ' + kind + (detail ? '!' + detail.slice(0, 60) : '')
          window.__bulcoinBootShowError &&
            window.__bulcoinBootShowError(
              detail
                ? 'Ошибка JS: ' + detail.slice(0, 160) + '. Нажмите «Повторить».'
                : exec
                  ? 'JS начался, но React не стартовал (' + kind + '). Нажмите «Повторить».'
                  : 'JS не выполнился в WebView (' + kind + '). Нажмите «Повторить».',
              detail ? 'E_THROW' : exec ? 'E_NOREACT' : 'E_NOEXEC'
            )
        }

        function scheduleCheck(kind) {
          window.__BULCOIN_JS_LOAD = file + ' ' + kind
          step('appjs:' + kind)
          if (reactOk()) return
          window.setTimeout(function () {
            if (!reactOk()) failNoReact(kind)
          }, 2500)
        }

        function bindSrcTag(el, reason) {
          if (!el) return
          armErrors()
          window.__BULCOIN_JS_LOAD = file + ' src…'
          step('appjs:src', reason || '')
          try {
            window.__bulcoinBootDl &&
              window.__bulcoinBootDl({
                file: file,
                loaded: 0,
                total: Number(window.__BULCOIN_APP_BYTES__) || 0,
              })
          } catch (eB) {}
          if (el.getAttribute('data-bulcoin-bound') === '1') return
          el.setAttribute('data-bulcoin-bound', '1')
          el.addEventListener('load', function () {
            try {
              window.__bulcoinBootDl &&
                window.__bulcoinBootDl({
                  file: file,
                  loaded: Number(window.__BULCOIN_APP_BYTES__) || 0,
                  total: Number(window.__BULCOIN_APP_BYTES__) || 0,
                  done: true,
                })
            } catch (eD) {}
            scheduleCheck(reactOk() ? 'src-ok' : 'src-load')
          })
          el.addEventListener('error', function () {
            step('appjs:src-error', reason || '')
            try {
              window.__bulcoinBootDl &&
                window.__bulcoinBootDl({ file: file, error: 'Не удалось скачать файл' })
            } catch (eE) {}
            if (!reactOk()) failNoReact('src-error')
          })
        }

        function runXhrProgress(reason) {
          if (reactOk() || window.__BULCOIN_JS_EXEC) return
          if (xhrStarted || window.__BULCOIN_XHR_MAIN === '1') return
          if (document.querySelector('script[data-bulcoin="html-src"],script[data-bulcoin="src"]')) {
            runSrc(reason || 'existing-src')
            return
          }
          xhrStarted = true
          window.__BULCOIN_XHR_MAIN = '1'
          armErrors()
          var known = Number(window.__BULCOIN_APP_BYTES__) || 0
          step('appjs:xhr', reason || 'full')
          window.__BULCOIN_JS_LOAD = file + ' xhr…'
          var activeXhr = null
          var aborted = false
          var stallTimer = null
          var lastByteAt = Date.now()

          function clearStall() {
            if (stallTimer) {
              window.clearTimeout(stallTimer)
              stallTimer = null
            }
          }

          function paintDl(loaded, total, errMsg) {
            try {
              lastByteAt = Date.now()
              window.__bulcoinBootDl &&
                window.__bulcoinBootDl({
                  file: file,
                  loaded: loaded,
                  total: total || known,
                  error: errMsg,
                })
              if (typeof window.__bulcoinBootProgress === 'function' && total > 0) {
                window.__bulcoinBootProgress(
                  Math.min(88, 40 + Math.round((loaded / total) * 45)),
                  undefined,
                )
              }
            } catch (eP) {}
          }

          function failDl(why) {
            clearStall()
            window.__BULCOIN_XHR_MAIN = '0'
            xhrStarted = false
            step('appjs:xhr-fail', why || '')
            try {
              window.__bulcoinBootDl &&
                window.__bulcoinBootDl({ file: file, error: 'Сеть — пробуем иначе…' })
            } catch (eF) {}
            runSrc(why || 'xhr-fail')
          }

          window.__bulcoinRetryAppDl = function (why) {
            if (reactOk() || window.__BULCOIN_JS_EXEC) return
            try {
              if (activeXhr) activeXhr.abort()
            } catch (eAb) {}
            aborted = true
            clearStall()
            window.__BULCOIN_XHR_MAIN = '0'
            xhrStarted = false
            aborted = false
            runXhrProgress(why || 'manual')
          }

          try {
            var xhr = new XMLHttpRequest()
            activeXhr = xhr
            xhr.open('GET', entryAbs, true)
            xhr.timeout = 300000
            xhr.onprogress = function (ev) {
              try {
                paintDl(
                  ev && ev.loaded ? ev.loaded : 0,
                  (ev && ev.lengthComputable && ev.total) || known,
                )
              } catch (ePr) {}
            }
            stallTimer = window.setTimeout(function tick() {
              if (aborted || reactOk() || window.__BULCOIN_JS_EXEC) return
              if (Date.now() - lastByteAt >= 20000) {
                try {
                  xhr.abort()
                } catch (eS) {}
                failDl('stall')
                return
              }
              stallTimer = window.setTimeout(tick, 4000)
            }, 4000)
            xhr.onreadystatechange = function () {
              if (xhr.readyState !== 4 || aborted) return
              clearStall()
              if (reactOk() || window.__BULCOIN_JS_EXEC === '1') return
              var st = xhr.status || 0
              if (st >= 200 && st < 300 && xhr.responseText) {
                try {
                  paintDl(xhr.responseText.length, xhr.responseText.length)
                  window.__bulcoinBootDl &&
                    window.__bulcoinBootDl({
                      file: file,
                      loaded: xhr.responseText.length,
                      total: xhr.responseText.length,
                      done: true,
                    })
                } catch (eDn) {}
                  try {
                  ;(0, eval)(xhr.responseText)
                  step('appjs:xhr-ok', 'full')
                  try {
                    window.__BULCOIN_LAST_JS_ERR = ''
                    lastErr = ''
                  } catch (eClr) {}
                  scheduleCheck('xhr')
                } catch (eEv) {
                  lastErr = String((eEv && eEv.message) || eEv || 'eval')
                  step('appjs:eval-fail', lastErr.slice(0, 120))
                  failDl('eval')
                }
                return
              }
              failDl('http-' + st)
            }
            xhr.onerror = function () {
              failDl('error')
            }
            xhr.ontimeout = function () {
              failDl('timeout')
            }
            paintDl(0, known)
            xhr.send()
          } catch (eOpen) {
            failDl('open')
          }
        }

        function runSrc(reason) {
          if (reactOk()) return
          var existing =
            document.querySelector('script[data-bulcoin="html-src"]') ||
            document.querySelector('script[data-bulcoin="src"]')
          if (existing) {
            srcStarted = true
            bindSrcTag(existing, reason || 'html-src')
            return
          }
          if (srcStarted) return
          srcStarted = true
          var s = document.createElement('script')
          s.src = entryAbs
          s.defer = true
          s.setAttribute('data-bulcoin', 'src')
          bindSrcTag(s, reason || 'dyn')
          document.head.appendChild(s)
        }

        // Prefer XHR+byte counter so 88% hang shows a live file download under the bar
        window.__BULCOIN_JS_LOAD = file + ' xhr-pending'
        step('appjs:boot', file + ' xhr-progress')
        runXhrProgress('boot')

        window.setTimeout(function () {
          if (!reactOk() && !window.__BULCOIN_JS_EXEC && window.__BULCOIN_XHR_MAIN !== '1') {
            runSrc('retry-2s')
          }
        }, 2000)
        window.setTimeout(function () {
          if (!reactOk() && !window.__BULCOIN_JS_EXEC && window.__BULCOIN_XHR_MAIN !== '1') {
            runSrc('retry-6s')
          }
        }, 6000)

        // If React marked but gate never advances — nudge UI (cold first-open)
        window.setTimeout(function () {
          if (!reactOk() || window.__BULCOIN_BOOT_FAILED) return
          var boot = document.getElementById('app-boot')
          if (!boot || boot.classList.contains('app-boot--hide')) return
          var last = String(window.__BULCOIN_BOOT_LAST || '')
          if (/react:boot|appjs:src-ok|appjs:xhr-ok/i.test(last) || /Запуск React/i.test(
            (document.getElementById('app-boot-text') || {}).textContent || ''
          )) {
            step('appjs:react-nudge')
            try {
              window.__bulcoinBootDl && window.__bulcoinBootDl({ hide: true })
              if (window.__bulcoinBootMessage) {
                window.__bulcoinBootMessage('Подключение к Telegram…')
              } else if (window.__bulcoinBootProgress) {
                window.__bulcoinBootProgress(52, 'Подключение к Telegram…')
              }
            } catch (eN) {}
          }
        }, 3500)
      })()

