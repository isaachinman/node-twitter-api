'use strict';

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _oauth2 = require('oauth');

var _oauth3 = _interopRequireDefault(_oauth2);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var baseUrl = 'https://api.twitter.com/1.1/';
var uploadBaseUrl = 'https://upload.twitter.com/1.1/';
var authUrl = 'https://twitter.com/oauth/authenticate?oauth_token=';

var twitterGenerator = function twitterGenerator(initParams) {

  var oa = new _oauth3.default.OAuth('https://twitter.com/oauth/request_token', 'https://twitter.com/oauth/access_token', initParams.consumerKey, initParams.consumerSecret, '1.0A', initParams.callback, 'HMAC-SHA1');

  var getRequestToken = function getRequestToken() {
    return new Promise(function (resolve, reject) {
      oa.getOAuthRequestToken({ x_auth_access_type: initParams.x_auth_access_type }, function (error, oauthToken, oauthTokenSecret, results) {

        if (error) {
          reject(error);
        } else {
          resolve({ oauthToken: oauthToken, oauthTokenSecret: oauthTokenSecret, results: results });
        }
      });
    });
  };

  var getAuthUrl = function getAuthUrl(requestToken, options) {
    return new Promise(function (resolve, reject) {
      try {
        var extraArgs = '';
        if (options && options.force_login) {
          extraArgs += '&force_login=1';
        }
        if (options && options.screen_name) {
          extraArgs += '&screen_name=' + options.screen_name;
        }
        resolve(authUrl + requestToken + extraArgs);
      } catch (error) {
        reject(error);
      }
    });
  };

  var getAccessToken = function getAccessToken(requestToken, requestTokenSecret, oauthVerifier) {
    return new Promise(function (resolve, reject) {
      oa.getOAuthAccessToken(requestToken, requestTokenSecret, oauthVerifier, function (error, oauthAccessToken, oauthAccessTokenSecret, results) {
        if (error) {
          reject(error);
        } else {
          resolve({ oauthAccessToken: oauthAccessToken, oauthAccessTokenSecret: oauthAccessTokenSecret, results: results });
        }
      });
    });
  };

  var verifyCredentials = function verifyCredentials(accessToken, accessTokenSecret, params) {
    return new Promise(function (resolve, reject) {
      var url = baseUrl + 'account/verify_credentials.json?' + _querystring2.default.stringify(params);
      oa.get(url, accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {
          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
            resolve({ parsedData: parsedData, response: response });
          } catch (e) {
            reject(e);
          }
        }
      });
    });
  };

  var getTimeline = function getTimeline(_type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var type = _type.toLowerCase();

      var url = void 0;
      switch (type) {
        case 'home_timeline':
        case 'home':
          url = 'home_timeline';
          break;
        case 'mentions_timeline':
        case 'mentions':
          url = 'mentions_timeline';
          break;
        case 'user_timeline':
        case 'user':
          url = 'user_timeline';
          break;
        case 'retweets_of_me':
        case 'retweets':
          url = 'retweets_of_me';
          break;
        default:
          reject(new Error('Please specify an existing type.'));
      }

      oa.get(baseUrl + 'statuses/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data) {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  };

  var getStream = function getStream(_type, params, accessToken, accessTokenSecret, dataCallback) {
    return new Promise(function (resolve, reject) {

      var type = _type.toLowerCase();
      var url = void 0;
      var method = 'GET';

      switch (type) {
        case 'userstream':
        case 'user':
          url = 'https://userstream.twitter.com/1.1/user.json';
          break;
        case 'sitestream':
        case 'site':
          url = 'https://sitestream.twitter.com/1.1/site.json';
          break;
        case 'sample':
          url = 'https://stream.twitter.com/1.1/statuses/sample.json';
          break;
        case 'firehose':
          url = 'https://stream.twitter.com/1.1/statuses/firehose.json';
          break;
        case 'filter':
          method = 'POST';
          url = 'https://stream.twitter.com/1.1/statuses/filter.json';
          break;
        default:
          reject(new Error('Please specify an existing type.'));
      }

      var req = void 0;
      if (method === 'GET') {
        req = oa.get(url + '?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret);
      } else {
        req = oa.post(url, accessToken, accessTokenSecret, params, null);
      }

      var msg = [];
      req.addListener('response', function (res) {
        res.setEncoding('utf-8');
        res.addListener('data', function (chunk) {
          if (chunk === '\r\n') {
            dataCallback(null, {}, chunk, res);
          } else if (chunk.substr(chunk.length - 2) === '\r\n') {
            msg.push(chunk.substr(0, chunk.length - 2));
            var ret = msg.join('');
            msg = [];

            var parsedRet = void 0;
            try {
              parsedRet = JSON.parse(ret);
            } catch (e) {
              dataCallback({
                message: 'Error while parsing Twitter-Response.',
                error: e
              }, null, chunk, res);
              return;
            }
            dataCallback(null, parsedRet, ret, res);
          } else {
            msg.push(chunk);
          }
        });
        res.addListener('end', function () {
          resolve(res);
        });
      });
      req.end();
      return req;
    });
  };

  var statuses = function statuses(type, _params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();
      var params = Object.assign({}, _params);
      var method = 'GET';

      switch (type) {
        case 'retweets':
          url = 'retweets/' + params.id;
          delete params.id;
          break;
        case 'show':
          url = 'show/' + params.id;
          delete params.id;
          break;
        case 'lookup':
          url = 'lookup';
          method = 'POST';
          break;
        case 'destroy':
          url = 'destroy/' + params.id;
          delete params.id;
          method = 'POST';
          break;
        case 'update':
          method = 'POST';
          break;
        case 'retweet':
          url = 'retweet/' + params.id;
          delete params.id;
          method = 'POST';
          break;
        case 'unretweet':
          url = 'unretweet/' + params.id;
          delete params.id;
          method = 'POST';
          break;
        case 'oembed':
          url = 'oembed';
          break;
        case 'update_with_media':
          reject(new Error("'update_with_media' type has been removed. Use 'upload_media' instead"));
          break;
        default:
          reject(new Error('Please specify an existing type.'));
      }

      if (method === 'GET') {
        oa.get(baseUrl + 'statuses/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {
          if (error) {
            reject(error);
          } else {
            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {
        oa.post(baseUrl + 'statuses/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {
          if (error) {
            reject(error, data, response);
          } else {
            resolve(data);
          }
        });
      }
    });
  };

  var uploadMedia = function uploadMedia(params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var r = _request2.default.post({
        url: uploadBaseUrl + 'media/upload.json',
        oauth: {
          consumer_key: initParams.consumerKey,
          consumer_secret: initParams.consumerSecret,
          token: accessToken,
          token_secret: accessTokenSecret
        }
      }, function (error, response, body) {

        if (error) {
          reject(error);
        } else {

          var parsedBody = void 0;
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedBody: parsedBody, response: response });
        }
      });

      var parameter = params.isBase64 ? 'media_data' : 'media';

      // multipart/form-data
      var form = r.form();
      if (_fs2.default.existsSync(params.media)) {
        form.append(parameter, _fs2.default.createReadStream(params.media));
      } else {
        form.append(parameter, params.media);
      }
    });
  };

  var uploadMediaChunked = function uploadMediaChunked(params, mediaType, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var bufferLength = 1000000;
      var theBuffer = new Buffer(bufferLength);
      var offset = 0;
      var segmentIndex = 0;
      var finished = 0;
      var oauthObj = {
        consumer_key: undefined.consumerKey,
        consumer_secret: undefined.consumerSecret,
        token: accessToken,
        token_secret: accessTokenSecret
      };

      _fs2.default.stat(params.media, function (err, stats) {

        var formData = {
          command: 'INIT',
          mediaType: mediaType,
          total_bytes: stats.size
        };
        var options = {
          url: uploadBaseUrl + 'media/upload.json',
          oauth: oauthObj,
          formData: formData
        };

        var finalizeMedia = function finalizeMedia(mediaID) {
          return function () {

            finished += 1;
            if (finished === segmentIndex) {
              options.formData = {
                command: 'FINALIZE',
                mediaID: mediaID
              };
              _request2.default.post(options, function (err2, response2, body) {
                if (err) {
                  reject(err2);
                }
                var parsedBody = void 0;
                try {
                  parsedBody = JSON.parse(body);
                } catch (e) {
                  reject(e);
                }
                resolve(parsedBody);
              });
            }
          };
        };
        _request2.default.post(options, function (err1, response, body) {
          var mediaID = JSON.parse(body).mediaID_string;
          _fs2.default.open(params.media, 'r', function (err2, fd) {
            var bytesRead = void 0;
            var data = void 0;

            while (offset < stats.size) {

              bytesRead = _fs2.default.readSync(fd, theBuffer, 0, bufferLength, null);
              data = bytesRead < bufferLength ? theBuffer.slice(0, bytesRead) : theBuffer;
              options.formData = {
                command: 'APPEND',
                media_id: mediaID,
                segment_index: segmentIndex,
                media_data: data.toString('base64')
              };
              _request2.default.post(options, finalizeMedia(mediaID));
              offset += bufferLength;
              segmentIndex += 1;
            }
          });
        });
      });
    });
  };

  var uploadVideo = function uploadVideo(params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {
      uploadMediaChunked(params, 'video/mp4', accessToken, accessTokenSecret).then(function (result) {
        return resolve(result);
      }).catch(function (error) {
        return reject(error);
      });
    });
  };

  var search = function search(params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      oa.get(baseUrl + 'search/tweets.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {
          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  var users = function users(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();

      var method = 'GET'; // show, search, contributees, contributors
      if (url === 'lookup') method = 'POST';

      if (method === 'GET') {
        oa.get(baseUrl + 'users/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {
          if (error) {
            reject(error);
          } else {
            var parsedData = null;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e, data, response);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {
        oa.post(baseUrl + 'users/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {
          if (error) {
            reject(error);
          } else {
            var parsedData = null;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var friends = function friends(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase(); // ids or list

      oa.get(baseUrl + 'friends/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {

          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  var followers = function followers(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {
      var url = type.toLowerCase(); // ids or list

      oa.get(baseUrl + 'followers/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {

          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  var friendships = function friendships(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase(); // ids or list
      var method = 'GET';

      // define endpoints that use POST
      switch (type) {
        case 'create':
        case 'destroy':
        case 'update':
          method = 'POST';
          break;
        default:
          break;
      }

      if (method === 'GET') {
        oa.get(baseUrl + 'friendships/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'friendships/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var updateProfileImage = function updateProfileImage(params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      if (!_fs2.default.existsSync(params.image)) {
        reject(new Error('no image'));
      }

      var r = _request2.default.post({
        url: baseUrl + 'account/update_profile_image.json',
        oauth: {
          consumer_key: undefined.consumerKey,
          consumer_secret: undefined.consumerSecret,
          token: accessToken,
          token_secret: accessTokenSecret
        }
      }, function (error, response, body) {

        if (error) {
          reject(error);
        } else {
          var parsedBody = void 0;
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedBody: parsedBody, response: response });
        }
      });

      // multipart/form-data
      /* eslint-disable */
      var form = r.form();
      for (var key in params) {
        if (key !== 'image') {
          form.append(key, params[key]);
        }
      }
      /* eslint-enable */
      form.append('image', _fs2.default.createReadStream(params.image));
    });
  };

  var account = function account(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();
      var method = 'POST';
      switch (url) {
        case 'settings':
          if (Object.keys(params).length === 0) {

            method = 'GET';
          }
          break;
        case 'verify_credentials':
          method = 'GET';
          break;
        case 'update_profile_image':
          updateProfileImage(params, accessToken, accessTokenSecret).then(function (result) {
            return resolve(result);
          }).catch(function (error) {
            return reject(error);
          });
          break;
        default:
          break;
      }

      if (method === 'GET') {
        oa.get(baseUrl + 'account/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {
          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {
        oa.post(baseUrl + 'account/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {
          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var blocks = function blocks(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();

      var method = 'GET';
      switch (url) {
        case 'create':
        case 'destroy':
          method = 'POST';
          break;
        default:
          break;
      }

      if (method === 'GET') {

        oa.get(baseUrl + 'blocks/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'blocks/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var mutes = function mutes(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();

      var method = 'GET';
      switch (url) {
        case 'users/create':
        case 'users/destroy':
          method = 'POST';
          break;
        default:
          break;
      }

      if (method === 'GET') {
        oa.get(baseUrl + 'mutes/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {
          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'mutes/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var suggestions = function suggestions(type, _params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var params = Object.assign({}, _params);
      var url = type.toLowerCase();

      switch (url) {
        case 'suggestions':
        case '':
          url = '';
          break;
        case 'members':
          url = params.slug + '/members';
          delete params.slug;
          break;
        case 'slug':
          url = params.slug;
          delete params.slug;
          break;
        default:
          break;
      }

      oa.get(baseUrl + 'users/suggestions' + (url ? '/' + url : '') + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {

          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  var favorites = function favorites(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();
      var method = 'GET';

      switch (url) {
        case 'destroy':
        case 'create':
          method = 'POST';
          break;
        default:
          break;
      }

      if (method === 'GET') {

        oa.get(baseUrl + 'favorites/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'favorites/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  /* eslint-disable camelcase */
  var direct_messages = function direct_messages(type, params, accessToken, accessTokenSecret) {
    return (
      /* eslint-enable camelcase */
      new Promise(function (resolve, reject) {

        var url = type.toLowerCase();
        var method = 'GET';

        switch (url) {

          case 'direct_messages':
          case '':
            url = '';
            break;
          case 'destroy':
          case 'new':
            method = 'POST';
            break;
          default:
            break;
        }

        if (method === 'GET') {

          oa.get(baseUrl + 'direct_messages' + (url ? '/' + url : '') + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

            if (error) {
              reject(error);
            } else {

              var parsedData = void 0;
              try {
                parsedData = JSON.parse(data);
              } catch (e) {
                reject(e);
              }
              resolve({ parsedData: parsedData, response: response });
            }
          });
        } else {

          oa.post(baseUrl + 'direct_messages/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

            if (error) {
              reject(error);
            } else {

              var parsedData = void 0;
              try {
                parsedData = JSON.parse(data);
              } catch (e) {
                reject(e);
              }
              resolve({ parsedData: parsedData, response: response });
            }
          });
        }
      })
    );
  };

  var lists = function lists(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();
      var method = 'GET';

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
          method = 'POST';
          break;
        default:
          break;
      }

      if (method === 'GET') {

        oa.get(baseUrl + 'lists/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'lists/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var savedSearches = function savedSearches(type, _params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var params = Object.assign({}, _params);
      var url = type.toLowerCase();
      var method = 'GET';

      switch (url) {
        case 'create':
          method = 'POST';
          break;
        case 'show':
          url = 'show/' + params.id;
          delete params.id;
          break;
        case 'destroy':
          url = 'destroy/' + params.id;
          delete params.id;
          method = 'POST';
          break;
        default:
          break;
      }

      if (method === 'GET') {

        oa.get(baseUrl + 'saved_searches/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'saved_searches/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var geo = function geo(type, _params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var params = Object.assign({}, _params);
      var url = type.toLowerCase();
      var method = 'GET';

      switch (url) {
        case 'place':
          method = 'POST';
          break;
        case 'id':
          url = 'id/' + params.place_id;
          delete params.place_id;
          break;
        default:
          break;
      }

      if (method === 'GET') {

        oa.get(baseUrl + 'geo/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {

            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + 'geo/' + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var trends = function trends(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();

      oa.get(baseUrl + 'trends/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {

          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  /* eslint-disable camelcase */
  var report_spam = function report_spam(type, params, accessToken, accessTokenSecret) {
    return (
      /* eslint-enable camelcase */
      new Promise(function (resolve, reject) {

        oa.post(baseUrl + 'users/report_spam.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      })
    );
  };

  var oauth = function oauth(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();
      var method = 'GET';

      switch (url) {
        case 'access_token':
        case 'request_token':
          method = 'POST';
          url = 'oauth/' + url;
          break;
        case 'token':
        case 'invalidate_token':
          method = 'POST';
          url = 'oauth2/' + url;
          break;
        default:
          url = 'oauth/' + url;
          break;
      }

      if (method === 'GET') {

        oa.get(baseUrl + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      } else {

        oa.post(baseUrl + url + '.json', accessToken, accessTokenSecret, params, function (error, data, response) {

          if (error) {
            reject(error);
          } else {

            var parsedData = void 0;
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              reject(e);
            }
            resolve({ parsedData: parsedData, response: response });
          }
        });
      }
    });
  };

  var help = function help(type, params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      var url = type.toLowerCase();

      oa.get(baseUrl + 'help/' + url + '.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {

          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  var rateLimitStatus = function rateLimitStatus(params, accessToken, accessTokenSecret) {
    return new Promise(function (resolve, reject) {

      oa.get(baseUrl + 'application/rate_limit_status.json?' + _querystring2.default.stringify(params), accessToken, accessTokenSecret, function (error, data, response) {

        if (error) {
          reject(error);
        } else {

          var parsedData = void 0;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          resolve({ parsedData: parsedData, response: response });
        }
      });
    });
  };

  return {
    consumerKey: initParams.consumerKey,
    consumerSecret: initParams.consumerSecret,
    callback: initParams.callback,
    x_auth_access_type: initParams.x_auth_access_type,
    // Methods
    getRequestToken: getRequestToken,
    getAuthUrl: getAuthUrl,
    getAccessToken: getAccessToken,
    verifyCredentials: verifyCredentials,
    getTimeline: getTimeline,
    getStream: getStream,
    statuses: statuses,
    uploadMedia: uploadMedia,
    uploadVideo: uploadVideo,
    uploadMediaChunked: uploadMediaChunked,
    search: search,
    users: users,
    friends: friends,
    followers: followers,
    friendships: friendships,
    updateProfileImage: updateProfileImage,
    account: account,
    blocks: blocks,
    mutes: mutes,
    suggestions: suggestions,
    favorites: favorites,
    direct_messages: direct_messages,
    lists: lists,
    savedSearches: savedSearches,
    geo: geo,
    trends: trends,
    report_spam: report_spam,
    oauth: oauth,
    help: help,
    rateLimitStatus: rateLimitStatus
  };
};

module.exports = twitterGenerator;