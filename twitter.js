import querystring from 'querystring'
import _oauth from 'oauth'
import request from 'request'
import fs from 'fs'

const baseUrl = 'https://api.twitter.com/1.1/'
const uploadBaseUrl = 'https://upload.twitter.com/1.1/'
const authUrl = 'https://twitter.com/oauth/authenticate?oauth_token='

const twitterGenerator = (initParams) => {

  const oa = new _oauth.OAuth(
    'https://twitter.com/oauth/request_token', 'https://twitter.com/oauth/access_token',
    initParams.consumerKey, initParams.consumerSecret, '1.0A', initParams.callback, 'HMAC-SHA1',
  )

  const getRequestToken = () =>
    new Promise((resolve, reject) => {
      oa.getOAuthRequestToken(
        { x_auth_access_type: initParams.x_auth_access_type },
        (error, oauthToken, oauthTokenSecret, results) => {

          if (error) {
            reject(error)
          } else {
            resolve({ oauthToken, oauthTokenSecret, results })
          }
        })
    })

  const getAuthUrl = (requestToken, options) =>
    new Promise((resolve, reject) => {
      try {
        let extraArgs = ''
        if (options && options.force_login) {
          extraArgs += '&force_login=1'
        }
        if (options && options.screen_name) {
          extraArgs += `&screen_name=${options.screen_name}`
        }
        resolve(authUrl + requestToken + extraArgs)

      } catch (error) {
        reject(error)
      }
    })

  const getAccessToken = (requestToken, requestTokenSecret, oauthVerifier) =>
    new Promise((resolve, reject) => {
      oa.getOAuthAccessToken(
        requestToken, requestTokenSecret, oauthVerifier,
        (error, oauthAccessToken, oauthAccessTokenSecret, results) => {
          if (error) {
            reject(error)
          } else {
            resolve({ oauthAccessToken, oauthAccessTokenSecret, results })
          }
        })
    })

  const verifyCredentials = (accessToken, accessTokenSecret, params) =>
    new Promise((resolve, reject) => {
      const url = `${baseUrl}account/verify_credentials.json?${querystring.stringify(params)}`
      oa.get(url, accessToken, accessTokenSecret, (error, data, response) => {

        if (error) {
          reject(error)
        } else {
          let parsedData
          try {
            parsedData = JSON.parse(data)
            resolve({ parsedData, response })
          } catch (e) {
            reject(e)
          }
        }

      })
    })

  const getTimeline = (_type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const type = _type.toLowerCase()

      let url
      switch (type) {
        case 'home_timeline':
        case 'home':
          url = 'home_timeline'
          break
        case 'mentions_timeline':
        case 'mentions':
          url = 'mentions_timeline'
          break
        case 'user_timeline':
        case 'user':
          url = 'user_timeline'
          break
        case 'retweets_of_me':
        case 'retweets':
          url = 'retweets_of_me'
          break
        default:
          reject(new Error('Please specify an existing type.'))
      }

      oa.get(`${baseUrl}statuses/${url}.json?${querystring.stringify(params)}`,
        accessToken, accessTokenSecret, (error, data) => {
          if (error) {
            reject(error)
          } else {
            resolve(data)
          }
        })
    })

  const getStream = (_type, params, accessToken, accessTokenSecret, dataCallback) =>
    new Promise((resolve, reject) => {

      const type = _type.toLowerCase()
      let url
      let method = 'GET'

      switch (type) {
        case 'userstream':
        case 'user':
          url = 'https://userstream.twitter.com/1.1/user.json'
          break
        case 'sitestream':
        case 'site':
          url = 'https://sitestream.twitter.com/1.1/site.json'
          break
        case 'sample':
          url = 'https://stream.twitter.com/1.1/statuses/sample.json'
          break
        case 'firehose':
          url = 'https://stream.twitter.com/1.1/statuses/firehose.json'
          break
        case 'filter':
          method = 'POST'
          url = 'https://stream.twitter.com/1.1/statuses/filter.json'
          break
        default:
          reject(new Error('Please specify an existing type.'))
      }

      let req
      if (method === 'GET') {
        req = oa.get(`${url}?${querystring.stringify(params)}`, accessToken, accessTokenSecret)
      } else {
        req = oa.post(url, accessToken, accessTokenSecret, params, null)
      }

      let msg = []
      req.addListener('response', (res) => {
        res.setEncoding('utf-8')
        res.addListener('data', (chunk) => {
          if (chunk === '\r\n') {
            dataCallback(null, {}, chunk, res)
          } else if (chunk.substr(chunk.length - 2) === '\r\n') {
            msg.push(chunk.substr(0, chunk.length - 2))
            const ret = msg.join('')
            msg = []

            let parsedRet
            try {
              parsedRet = JSON.parse(ret)
            } catch (e) {
              dataCallback({
                message: 'Error while parsing Twitter-Response.',
                error: e,
              }, null, chunk, res)
              return
            }
            dataCallback(null, parsedRet, ret, res)

          } else {
            msg.push(chunk)
          }
        })
        res.addListener('end', () => {
          resolve(res)
        })
      })
      req.end()
      return req
    })

  const statuses = (type, _params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      let url = type.toLowerCase()
      const params = Object.assign({}, _params)
      let method = 'GET'

      switch (type) {
        case 'retweets':
          url = `retweets/${params.id}`
          delete params.id
          break
        case 'show':
          url = `show/${params.id}`
          delete params.id
          break
        case 'lookup':
          url = 'lookup'
          method = 'POST'
          break
        case 'destroy':
          url = `destroy/${params.id}`
          delete params.id
          method = 'POST'
          break
        case 'update':
          method = 'POST'
          break
        case 'retweet':
          url = `retweet/${params.id}`
          delete params.id
          method = 'POST'
          break
        case 'unretweet':
          url = `unretweet/${params.id}`
          delete params.id
          method = 'POST'
          break
        case 'oembed':
          url = 'oembed'
          break
        case 'update_with_media':
          reject(new Error("'update_with_media' type has been removed. Use 'upload_media' instead"))
          break
        default:
          reject(new Error('Please specify an existing type.'))
      }

      if (method === 'GET') {
        oa.get(`${baseUrl}statuses/${url}.json?${querystring.stringify(params)}`, accessToken, accessTokenSecret, (error, data, response) => {
          if (error) {
            reject(error)
          } else {
            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
      } else {
        oa.post(`${baseUrl}statuses/${url}.json`, accessToken, accessTokenSecret, params, (error, data, response) => {
          if (error) {
            reject(error, data, response)
          } else {
            resolve(data)
          }
        })
      }
    })

  const uploadMedia = (params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const r = request.post({
        url: `${uploadBaseUrl}media/upload.json`,
        oauth: {
          consumer_key: initParams.consumerKey,
          consumer_secret: initParams.consumerSecret,
          token: accessToken,
          token_secret: accessTokenSecret,
        },
      }, (error, response, body) => {

        if (error) {
          reject(error)
        } else {

          let parsedBody
          try {
            parsedBody = JSON.parse(body)
          } catch (e) {
            reject(e)
          }
          resolve({ parsedBody, response })
        }

      })

      const parameter = (params.isBase64) ? 'media_data' : 'media'

      // multipart/form-data
      const form = r.form()
      if (fs.existsSync(params.media)) {
        form.append(parameter, fs.createReadStream(params.media))
      } else {
        form.append(parameter, params.media)
      }
    })

  const uploadMediaChunked = (params, mediaType, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const bufferLength = 1000000
      const theBuffer = new Buffer(bufferLength)
      let offset = 0
      let segmentIndex = 0
      let finished = 0
      const oauthObj = {
        consumer_key: this.consumerKey,
        consumer_secret: this.consumerSecret,
        token: accessToken,
        token_secret: accessTokenSecret,
      }

      fs.stat(params.media, (err, stats) => {

        const formData = {
          command: 'INIT',
          mediaType,
          total_bytes: stats.size,
        }
        const options = {
          url: `${uploadBaseUrl}media/upload.json`,
          oauth: oauthObj,
          formData,
        }

        const finalizeMedia = mediaID => () => {

          finished += 1
          if (finished === segmentIndex) {
            options.formData = {
              command: 'FINALIZE',
              mediaID,
            }
            request.post(options, (err2, response2, body) => {
              if (err) {
                reject(err2)
              }
              let parsedBody
              try {
                parsedBody = JSON.parse(body)
              } catch (e) {
                reject(e)
              }
              resolve(parsedBody)
            })
          }

        }
        request.post(options, (err1, response, body) => {
          const mediaID = JSON.parse(body).mediaID_string
          fs.open(params.media, 'r', (err2, fd) => {
            let bytesRead
            let data

            while (offset < stats.size) {

              bytesRead = fs.readSync(fd, theBuffer, 0, bufferLength, null)
              data = bytesRead < bufferLength ? theBuffer.slice(0, bytesRead) : theBuffer
              options.formData = {
                command: 'APPEND',
                media_id: mediaID,
                segment_index: segmentIndex,
                media_data: data.toString('base64'),
              }
              request.post(options, finalizeMedia(mediaID))
              offset += bufferLength
              segmentIndex += 1
            }
          })
        })
      })
    })

  const uploadVideo = (params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {
      uploadMediaChunked(params, 'video/mp4', accessToken, accessTokenSecret)
        .then(result => resolve(result))
        .catch(error => reject(error))
    })

  const search = (params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      oa.get(`${baseUrl}search/tweets.json?${querystring.stringify(params)}`, accessToken, accessTokenSecret, (error, data, response) => {

        if (error) {
          reject(error)
        } else {
          let parsedData
          try {
            parsedData = JSON.parse(data)
          } catch (e) {
            reject(e)
          }
          resolve({ parsedData, response })
        }
      })
    })

  const users = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()

      let method = 'GET' // show, search, contributees, contributors
      if (url === 'lookup') method = 'POST'

      if (method === 'GET') {
        oa.get(`${baseUrl}users/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {
            if (error) {
              reject(error)
            } else {
              let parsedData = null
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e, data, response)
              }
              resolve({ parsedData, response })
            }
          })
      } else {
        oa.post(`${baseUrl}users/${url}.json`, accessToken, accessTokenSecret, params, (error, data, response) => {
          if (error) {
            reject(error)
          } else {
            let parsedData = null
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
      }
    })

  const friends = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase() // ids or list

      oa.get(`${baseUrl}friends/${url}.json?${querystring.stringify(params)}`,
        accessToken, accessTokenSecret, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
    })

  const followers = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {
      const url = type.toLowerCase() // ids or list

      oa.get(`${baseUrl}followers/${url}.json?${querystring.stringify(params)}`, accessToken, accessTokenSecret, (error, data, response) => {

        if (error) {
          reject(error)
        } else {

          let parsedData
          try {
            parsedData = JSON.parse(data)
          } catch (e) {
            reject(e)
          }
          resolve({ parsedData, response })
        }
      })
    })

  const friendships = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase() // ids or list
      let method = 'GET'

      // define endpoints that use POST
      switch (type) {
        case 'create':
        case 'destroy':
        case 'update':
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {
        oa.get(`${baseUrl}friendships/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }

          })

      } else {

        oa.post(`${baseUrl}friendships/${url}.json`, accessToken, accessTokenSecret, params, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
      }
    })

  const updateProfileImage = (params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      if (!fs.existsSync(params.image)) {
        reject(new Error('no image'))
      }

      const r = request.post({
        url: `${baseUrl}account/update_profile_image.json`,
        oauth: {
          consumer_key: this.consumerKey,
          consumer_secret: this.consumerSecret,
          token: accessToken,
          token_secret: accessTokenSecret,
        },
      }, (error, response, body) => {

        if (error) {
          reject(error)
        } else {
          let parsedBody
          try {
            parsedBody = JSON.parse(body)
          } catch (e) {
            reject(e)
          }
          resolve({ parsedBody, response })
        }
      })

      // multipart/form-data
      /* eslint-disable */
      const form = r.form()
      for (const key in params) {
        if (key !== 'image') {
          form.append(key, params[key])
        }
      }
      /* eslint-enable */
      form.append('image', fs.createReadStream(params.image))
    })

  const account = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()
      let method = 'POST'
      switch (url) {
        case 'settings':
          if (Object.keys(params).length === 0) {

            method = 'GET'
          }
          break
        case 'verify_credentials':
          method = 'GET'
          break
        case 'update_profile_image':
          updateProfileImage(params, accessToken, accessTokenSecret)
            .then(result => resolve(result))
            .catch(error => reject(error))
          break
        default:
          break
      }

      if (method === 'GET') {
        oa.get(`${baseUrl}account/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {
            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {
        oa.post(`${baseUrl}account/${url}.json`, accessToken, accessTokenSecret, params, (error, data, response) => {
          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
      }
    })

  const blocks = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()

      let method = 'GET'
      switch (url) {
        case 'create':
        case 'destroy':
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl}blocks/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }

          })

      } else {

        oa.post(`${baseUrl}blocks/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  const mutes = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()

      let method = 'GET'
      switch (url) {
        case 'users/create':
        case 'users/destroy':
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {
        oa.get(`${baseUrl}mutes/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {
            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {

        oa.post(`${baseUrl}mutes/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  const suggestions = (type, _params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const params = Object.assign({}, _params)
      let url = type.toLowerCase()

      switch (url) {
        case 'suggestions':
        case '':
          url = ''
          break
        case 'members':
          url = `${params.slug}/members`
          delete params.slug
          break
        case 'slug':
          url = params.slug
          delete params.slug
          break
        default:
          break
      }

      oa.get(`${baseUrl}users/suggestions${(url) ? `/${url}` : ''}.json?${querystring.stringify(params)}`,
        accessToken, accessTokenSecret, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
    })

  const favorites = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()
      let method = 'GET'

      switch (url) {
        case 'destroy':
        case 'create':
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl}favorites/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {

        oa.post(`${baseUrl}favorites/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  /* eslint-disable camelcase */
  const direct_messages = (type, params, accessToken, accessTokenSecret) =>
  /* eslint-enable camelcase */
    new Promise((resolve, reject) => {

      let url = type.toLowerCase()
      let method = 'GET'

      switch (url) {

        case 'direct_messages':
        case '':
          url = ''
          break
        case 'destroy':
        case 'new':
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl}direct_messages${(url) ? `/${url}` : ''}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {

        oa.post(`${baseUrl}direct_messages/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })


  const lists = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()
      let method = 'GET'

      switch (url) {

        case 'members/destroy':
        case 'members/destroy_all':
        case 'members/create':
        case 'members/create_all':
        case 'subscribers/create':
        case 'subscribers/destroy':
        case 'destroy':
        case 'update':
        case 'create':
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl}lists/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }

          })

      } else {

        oa.post(`${baseUrl}lists/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  const savedSearches = (type, _params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const params = Object.assign({}, _params)
      let url = type.toLowerCase()
      let method = 'GET'

      switch (url) {
        case 'create':
          method = 'POST'
          break
        case 'show':
          url = `show/${params.id}`
          delete params.id
          break
        case 'destroy':
          url = `destroy/${params.id}`
          delete params.id
          method = 'POST'
          break
        default:
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl}saved_searches/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {

        oa.post(`${baseUrl}saved_searches/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  const geo = (type, _params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const params = Object.assign({}, _params)
      let url = type.toLowerCase()
      let method = 'GET'

      switch (url) {
        case 'place':
          method = 'POST'
          break
        case 'id':
          url = `id/${params.place_id}`
          delete params.place_id
          break
        default:
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl}geo/${url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {

              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {

        oa.post(`${baseUrl}geo/${url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  const trends = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()

      oa.get(`${baseUrl}trends/${url}.json?${querystring.stringify(params)}`,
        accessToken, accessTokenSecret, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
    })

  /* eslint-disable camelcase */
  const report_spam = (type, params, accessToken, accessTokenSecret) =>
  /* eslint-enable camelcase */
    new Promise((resolve, reject) => {

      oa.post(`${baseUrl}users/report_spam.json`,
        accessToken, accessTokenSecret, params, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
    })

  const oauth = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      let url = type.toLowerCase()
      let method = 'GET'

      switch (url) {
        case 'access_token':
        case 'request_token':
          method = 'POST'
          url = `oauth/${url}`
          break
        case 'token':
        case 'invalidate_token':
          method = 'POST'
          url = `oauth2/${url}`
          break
        default:
          url = `oauth/${url}`
          break
      }

      if (method === 'GET') {

        oa.get(`${baseUrl + url}.json?${querystring.stringify(params)}`,
          accessToken, accessTokenSecret, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })

      } else {

        oa.post(`${baseUrl + url}.json`,
          accessToken, accessTokenSecret, params, (error, data, response) => {

            if (error) {
              reject(error)
            } else {

              let parsedData
              try {
                parsedData = JSON.parse(data)
              } catch (e) {
                reject(e)
              }
              resolve({ parsedData, response })
            }
          })
      }
    })

  const help = (type, params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      const url = type.toLowerCase()

      oa.get(`${baseUrl}help/${url}.json?${querystring.stringify(params)}`,
        accessToken, accessTokenSecret, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
    })

  const rateLimitStatus = (params, accessToken, accessTokenSecret) =>
    new Promise((resolve, reject) => {

      oa.get(`${baseUrl}application/rate_limit_status.json?${querystring.stringify(params)}`,
        accessToken, accessTokenSecret, (error, data, response) => {

          if (error) {
            reject(error)
          } else {

            let parsedData
            try {
              parsedData = JSON.parse(data)
            } catch (e) {
              reject(e)
            }
            resolve({ parsedData, response })
          }
        })
    })

  return {
    consumerKey: initParams.consumerKey,
    consumerSecret: initParams.consumerSecret,
    callback: initParams.callback,
    x_auth_access_type: initParams.x_auth_access_type,
    // Methods
    getRequestToken,
    getAuthUrl,
    getAccessToken,
    verifyCredentials,
    getTimeline,
    getStream,
    statuses,
    uploadMedia,
    uploadVideo,
    uploadMediaChunked,
    search,
    users,
    friends,
    followers,
    friendships,
    updateProfileImage,
    account,
    blocks,
    mutes,
    suggestions,
    favorites,
    direct_messages,
    lists,
    savedSearches,
    geo,
    trends,
    report_spam,
    oauth,
    help,
    rateLimitStatus,
  }

}

module.exports = twitterGenerator
