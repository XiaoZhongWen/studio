// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

let uobc = require('uni-open-bridge-common')
const crypto = require('crypto')
const xml2js = require('xml2js')
const WXBizMsgCrypt = require('wechat-crypto')
const { stringify } = require('querystring')
const key = {
	"dcloudAppid": "__UNI__1226721",
	"platform": "weixin-h5"
}
const subscribeReply = "😄好开心，欢迎您加入嗒嗒课吧！\n\n👩🏻‍🏫如果您是老师，让嗒嗒课吧数字化您的教学过程，节省您的教务时间\n\n📅简洁高效的排课方式，减少您每一分钟的辛苦\n⏰排课通知、上课通知、消课通知、续费通知等，为您的教学过程更添一分温暖\n\n💖如果您是学员或家长，让嗒嗒课吧陪伴您的每一次课，记录您每一次的成长\n\n✨上课提醒，提前获取\n✨课消记录，实时推送\n✨课程反馈，记录成长"

async function checkAndRegisterUser(openId) {
	if (typeof(openId) === 'undefined' || openId.length === 0) {
		return false
	}
	try {
		const { access_token } = await uobc.getAccessToken(key)
		const result = await uniCloud.httpclient.request("https://api.weixin.qq.com/cgi-bin/user/info?access_token=" + access_token + "&openid=" + openId + "&lang=zh_CN", {
			method:'GET',
			contentType: 'json',
			dataType: 'json'
		})
		const { subscribe, openid, unionid } = result.data
		if (subscribe === 1) {
			const db = uniCloud.database()
			const res1 = await db.collection("wk-wx").where({
				wx_unionid: unionid
			}).count()
			if (res1.total === 0) {
				const res2 = await db.collection("wk-wx").add({
					"wx_unionid": unionid,
					"fwh_openid": openid
				})
				return res.inserted === 1
			} else {
				const res = await db.collection("wk-wx").where({
					wx_unionid: unionid
				}).update({
					fwh_openid: openid
				})
				return res.updated === 1
			}
		}
		return false
	} catch(e) {
		console.info(e)
		return false
	}
}

async function handleSubscribeEvent(event, openId) {
	const db = uniCloud.database()
	if (event === 'subscribe') {
		// 订阅
		const data = await db.collection("wk-wx").where({
			fwh_openid: openId
		}).count()
		const count = data.total
		if (count === 0) {
			await checkAndRegisterUser(openId)
		}
	} else if (event === 'unsubscribe') {
		// 取消订阅
		const res = await db.collection("wk-wx").where({
			fwh_openid: openId
		}).update({
			fwh_openid: ""
		})
	}
}

function buildTemplateMessageBody(openId, appid, type, data) {
	if (typeof(openId) === 'undefined' || openId.length === 0 ||
		typeof(type) === 'undefined' || type.length === 0) {
		return {}
	}
	let result = {}
	if (type === "schedule_success") {
		const { course, teacher, student, duration } = data
		result = {
			"touser": openId,
			"template_id": "7svCP-LitRyI_EXA12KLb6ojKoZtv7lEJSgH5XeWChs",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing1": {
					"value": course
				},
				"thing5": {
					"value": teacher
				},
				"thing4": {
					"value": student
				},
				"time2": {
					"value": duration
				}
			}
		}
	} else if (type === "modify_date") {
		const { course, student, originalTime, newTime } = data
		result = {
			"touser": openId,
			"template_id": "l9mWta55NG_ZtrC449jV-ZVi8JCZvHvSkPv_-fHD0yk",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing2": {
					"value": course
				},
				"thing17": {
					"value": student
				},
				"time4": {
					"value": originalTime
				},
				"time5": {
					"value": newTime
				}
			}
		}
	} else if (type === "schedule_consume") {
		const { student, course, consume, surplus } = data
		result = {
			"touser": openId,
			"template_id": "qsPlJVejULxe2mRzOEQpDpNomgLhNrLRvfpiFA6d3t4",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing2": {
					"value": student
				},
				"thing6": {
					"value": course
				},
				"short_thing3": {
					"value": consume
				},
				"short_thing4": {
					"value": surplus
				}
			}
		}
	} else if (type === "schedule_cancel") {
		const { orgName, student, course, time, reason } = data
		result = {
			"touser": openId,
			"template_id": "5HPlCwe9TXJQXdS60RPsvyIpXPExmzWJ0rlrSrb5vvM",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing10": {
					"value": orgName
				},
				"thing5": {
					"value": student
				},
				"thing1": {
					"value": course
				},
				"time8": {
					"value": time
				},
				"thing4": {
					"value": reason
				}
			}
		}
	} else if (type === "bind_course") {
		const { student, course } = data
		result = {
			"touser": openId,
			"template_id": "m7fRBBfzHfgpxW1CVyE_xpswVm-bRBSEIIQ7Hx0lfY0",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing1": {
					"value": student
				},
				"thing3": {
					"value": course
				}
			}
		}
	} else if (type === "renew_course1") {
		const { student, renewCount, total, date } = data
		result = {
			"touser": openId,
			"template_id": "YW-1eYDy97cXLW2DyhNgRCS32tu4FbenxQDzqt04YzQ",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing1": {
					"value": student
				},
				"character_string3": {
					"value": renewCount.toString()
				},
				"character_string4": {
					"value": total.toString()
				},
				"time5": {
					"value": date
				}
			}
		}
	} else if (type === "renew_course2") {
		const { student, renewCount, total, date } = data
		result = {
			"touser": openId,
			"template_id": "YW-1eYDy97cXLW2DyhNgRK_Dd-OeVdSk7NmHXgry7VQ",
			"miniprogram": {
				"appid": appid
			},
			"data": {
				"thing1": {
					"value": student
				},
				"character_string9": {
					"value": renewCount.toString()
				},
				"character_string11": {
					"value": total.toString()
				},
				"time5": {
					"value": date
				}
			}
		}
	}
	return result
}

module.exports = {
	_before: function () { // 通用预处理器

	},
	async templateMessage(s, type) {
		try {
			const { access_token } = await uobc.getAccessToken(key)
			const db = uniCloud.database()
			const response = await db.collection("wk-app").field({"mp":true}).get()
			const record = response.data
			if (record.length > 0) {
				const { appid } = record[0].mp
				for (let notification of s) {
					const { userId } = notification
					const res = await db.collection("wk-wx").where({
						userId
					}).get()
					if (res.data.length > 0) {
						const item = res.data[0]
						const fwh_openid = item.fwh_openid
						if (typeof(fwh_openid) !== 'undefined' && fwh_openid.length > 0) {
							const data = buildTemplateMessageBody(fwh_openid, appid, type, notification)
							if (JSON.stringify(data) !== "{}") {
								const result = await uniCloud.httpclient.request('https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=' + access_token, {
									method:'POST',
									data,
									contentType: 'json',
									dataType: 'json'
								})
							}
						}
					}
				}
			}
		} catch(e) {
			console.info(e)
		}
	},
	async publicAccount(ctx) {
		const httpInfo = this.getHttpInfo()
		const method = httpInfo.httpMethod
		const db = uniCloud.database()
		const res = await db.collection("wk-app").field({"h5":true}).get()
		const data = res.data
		if (data.length > 0) {
			const { appid, token, encodingAesKey } = data[0].h5
			if (method === "GET") {
				let {signature = '', timestamp = '', nonce = '', echostr = ''} = ctx
				// 验证token
				let str = [token, timestamp, nonce].sort().join('')
				let sha1 = crypto.createHash('sha1').update(str).digest('hex')
				if (sha1 !== signature) {
					return 'token验证失败'
				} else {
					return echostr
				}
			} else if (method === "POST") {
				let body = httpInfo.body
				if(httpInfo.isBase64Encoded){
					body = Buffer.from(body, 'base64').toString('utf8')
				}
				const queryStringParameters = httpInfo.queryStringParameters
				const parser = new xml2js.Parser
				const result = await parser.parseStringPromise(body)
				
				// 解密消息内容
				const encryptMessage = result.xml.Encrypt[0]
				const timestamp = queryStringParameters.timestamp
				const nonce = queryStringParameters.nonce
				const cryptor = new WXBizMsgCrypt(token, encodingAesKey, appid)
				const decryptedXML = cryptor.decrypt(encryptMessage)
				
				const recMsg = await parser.parseStringPromise(decryptedXML.message)
				const msgType = recMsg.xml.MsgType[0]
				const openId = recMsg.xml.FromUserName[0]
				const to = recMsg.xml.ToUserName[0]
				const from = recMsg.xml.FromUserName[0]
				if (msgType === 'event') {
					// 事件
					const event = recMsg.xml.Event[0]
					if (event === 'subscribe' || event === 'unsubscribe') {
						// 订阅事件
						await handleSubscribeEvent(event, openId)
						if (event === 'subscribe') {
							const builder = new xml2js.Builder({ headless: true })
							let xmlStr = builder.buildObject({
								xml: {
									ToUserName: "<![CDATA[" + from + "]]>",
									FromUserName: "<![CDATA[" + to + "]]>",
									CreateTime: Date.now() / 1000,
									MsgType: "<![CDATA[text]]>",
									Content: "<![CDATA[" + subscribeReply + "]]>"
								}
							})
							xmlStr = xmlStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
							console.info(xmlStr)
							return xmlStr
						}
					}
				}
				return "success"
			}
		} 
	}
}
