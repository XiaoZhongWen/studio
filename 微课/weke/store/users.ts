import { defineStore } from 'pinia'
import { useOrgsStore } from "@/store/orgs"
import { RoleId, Student, User, WxIdentity } from '@/types/user'
// @ts-ignore
import md5 from 'js-md5'
import { Entry } from '../types/entry'

enum IdentityType {
	UseUnionId = 'unionid',
	UseOpenId = 'openid'
}

let identityType = IdentityType.UseUnionId
const users_co = uniCloud.importObject('users', {
	customUI: true
})

const course_co = uniCloud.importObject('course', {
	customUI: true
})

export const useUsersStore = defineStore('users', {
	state: () => {
		return {
			beInvited: false,
			isLogin: false,
			owner: {
				_id: '',
				identity: '',
				expireDate: 0,
				isSubscribed: false,
				unionid: '',
				openid: '',
				session_key: '',
				avatarId: '',
				avatarUrl: '',
				tempFileUrl: '',
				nickName: '',
				roles: [],
				studentNo: '',
				status: 0,
				from: 'wx'
			} as User & WxIdentity & {studentNo:string, status: number, from:string, identity:string},
			lastLoginInfo: {
				unionid: '',
				openid: '',
				nickName: '',
				tempFileUrl: ''
			},
			students: [] as Student[],
			children: [] as Student[],
			users: [] as User[],
			entries: [] as Entry[]
		}
	},
	getters: {
		roleNames(state) {
			return state.owner.roles?.map((roleId:RoleId) => {
				let name = ''
				switch(roleId) {
					case 1:
						name = "管理员"
						break
					case 2:
						name = "老师"
						break
					case 3:
						name = "家长"
						break
				}
				return name
			})
		},
		signature(state) {
			return state.owner.signature ?? '个性签名'
		},
		isExpired(state) {
			let date = state.owner.expireDate
			const current = Date.now()
			return current > date
		},
		roles(state) {
			return state.owner.roles
		}
	},
	
	actions: {
		// 登录
		// 当from为stuNo时, stuNo、pwd为传入的学号和密码
		async login(from="wx", stuNo?:string, pwd?:string) {
			if (this.isLogin === false) {
				if (from === 'wx') {
					try {
						// 1. 获取openid、unionid, session_key
						const res = await uni.login({
							provider: 'weixin'
						})
						const session = await users_co.code2Session(res.code)
						const { session_key, openid, unionid } = session.data
						// 2. 云端验证openid、unionid
						const userInfo = await users_co.authIdentity({
							openid: openid,
							unionid: (identityType === IdentityType.UseUnionId)? unionid: "",
							type: (identityType === IdentityType.UseUnionId)? 'wx_unionid': 'wx_openid'
						}) as User & WxIdentity
						// 3. 通过验证则返回用户信息
						if (JSON.stringify(userInfo) !== '{}') {
							// 更新owner对象
							this.owner.openid = openid
							this.owner.unionid = (identityType === IdentityType.UseUnionId)? unionid: ""
							this.owner.session_key = session_key
							
							const { 
								_id, 
								nickName, 
								expireDate,
								isSubscribed,
								avatarId, 
								roles, 
								mobile,  
								signature
							} = userInfo
							this.owner._id = _id
							this.owner.nickName = nickName
							this.owner.expireDate = expireDate
							this.owner.isSubscribed = isSubscribed
							this.owner.avatarId = avatarId
							if (typeof(roles) !== 'undefined') {
								this.owner.roles = roles
							}
							if (typeof(mobile) !== 'undefined') {
								this.owner.mobile = mobile
							}
							if (typeof(signature) !== 'undefined') {
								this.owner.signature = signature
							}
							// 更新lastLoginInfo对象
							this.lastLoginInfo.unionid = (identityType === IdentityType.UseUnionId)? unionid: ""
							this.lastLoginInfo.openid = openid
							this.lastLoginInfo.nickName = this.owner.nickName ?? ''
							const result = await uniCloud.getTempFileURL({
								fileList:[this.owner.avatarId]
							})
							const { tempFileURL } = result.fileList[0]
							this.updateAvatarUrl(tempFileURL)
							
							const index = this.users.findIndex(user => user._id === _id)
							if (index === -1) {
								this.users.push(this.owner)
							}
							this.isLogin = true
						} else {
							this.owner.openid = openid
							this.owner.unionid = unionid
							this.owner.session_key = session_key
						}
						uni.setStorage({
							key: "wk-login",
							data: {
								from: 'wx'
							}
						})
					} catch (e) {
						console.error("登录报错: " + JSON.stringify(e))
					}
				} else if (from === 'stuNo') {
					if (typeof(stuNo) !== 'undefined' && stuNo.length &&
						typeof(pwd) !== 'undefined' && pwd.length) {
						const student = await users_co.authStuIdentity(stuNo, pwd)
						if (JSON.stringify(student) !== '{}') {
							const { _id, identity, avatarId, mobile, nickName, status, studentNo, signature } = student
							this.owner._id = _id
							this.owner.identity = identity
							this.owner.mobile = mobile
							this.owner.nickName = nickName
							this.owner.status = status
							this.owner.studentNo = studentNo
							this.owner.from = 'stuNo'
							this.owner.signature = signature
							if (typeof(avatarId) !== 'undefined' && avatarId.length > 0) {
								this.owner.avatarId = avatarId
								const result = await uniCloud.getTempFileURL({
									fileList:[this.owner.avatarId]
								})
								const { tempFileURL } = result.fileList[0]
								this.updateAvatarUrl(tempFileURL)
							}
							uni.setStorage({
								key: "wk-login",
								data: {
									from: 'stuNo',
									stuNo: stuNo,
									pwd
								}
							})
							this.isLogin = true
						}
					}
				}
			} else {
				console.info("用户是已登录状态")
			}
			return this.isLogin
		},
		// 更改密码
		async changePassword(studentNo:string, originalPwd:string, pwd:string) {
			let result = false
			if (typeof(studentNo) === 'undefined' || studentNo.length === 0 ||
				typeof(originalPwd) === 'undefined' || originalPwd.length === 0 ||
				typeof(pwd) === 'undefined' || pwd.length === 0) {
				return result
			}
			result = await users_co.changePassword(studentNo, originalPwd, pwd)
			return result
		},
		// 上传头像
		async uploadPortrait() {
			const lastAvatarUrl = this.lastLoginInfo.tempFileUrl ?? ''
			const avatarUrl = this.owner.tempFileUrl ?? ''
			let result = false
			if (lastAvatarUrl !== avatarUrl || avatarUrl.length === 0) {
				const url = this.owner.tempFileUrl?.trim() ?? ""
				const prefix = "ddkb/header/"
				const oldFileId = this.owner.avatarId ?? ''
				// @ts-ignore
				const res = await uniCloud.uploadFile({
					filePath: url,
					cloudPath: prefix + md5(url)
				})
				const { fileID } = res
				this.updateAvatarId(fileID)
				try {
					const response = await uniCloud.getTempFileURL({
						fileList:[fileID]
					})
					const { tempFileURL } = response.fileList[0]
					this.updateAvatarUrl(tempFileURL)
					result = true
					if (oldFileId.length > 0) {
						// 删除旧头像
						uniCloud.deleteFile({
							fileList:[oldFileId]
						}).then((res)=>{
						}).catch(() => {
						})
					}
				} catch (error) {
				}
			} else {
			}
			return result
		},
		// 更新云端用户信息
		async updateCloudUser() {
			let result = false
			try {
				if (this.owner.from === 'wx') {
					const res = await users_co.updateUser({
						...this.owner,
						type: (identityType === IdentityType.UseUnionId)? 'wx_unionid': 'wx_openid'
					})
					const { _id, expireDate } = res as {_id: string, registerDate:number, lastLoginDate:number, expireDate:number}
					if (this.owner._id.length === 0) {
						this.owner._id = _id
						this.owner.expireDate = expireDate
					}
				} else {
					await users_co.updateStudent({...this.owner})
				}
				if (this.isLogin === false) {
					this.isLogin = true
				}
				result = true
			} catch (e) {
			}
			return result
		},
		// 更新学生头像
		async updateStudentAvatar(id:string, avatarUrl:string) {
			if (typeof(id) === 'undefined' || id.length === 0 ||
				typeof(avatarUrl) === 'undefined' || avatarUrl.length === 0) {
				return false
			}
			const s = [...this.students, ...this.children]
			const res = s.filter(student => student._id === id)
			if (res.length > 0) {
				const student = res[0]
				const prefix = "ddkb/header/"
				// @ts-ignore
				const result = await uniCloud.uploadFile({
					filePath: avatarUrl,
					cloudPath: prefix + md5(avatarUrl)
				})
				const { fileID } = result
				if (fileID.length > 0) {
					const success = await users_co.updateStudentAvatarId(student.studentNo, fileID)
					if (success === true) {
						if (typeof(student.avatarId) !== 'undefined' &&
							student.avatarId.length > 0) {
							uniCloud.deleteFile({
								fileList:[student.avatarId]
							}).then((res)=>{
							}).catch(() => {
							})
						}
						s.forEach(stu => {
							if (stu._id === id) {
								stu.avatarId = fileID
								stu.avatarUrl = avatarUrl
							}
						})
					}
					return success
				}
			}
			return false
		},
		async updateStudentNickname(id:string, nickname:string) {
			if (typeof(id) === 'undefined' || id.length === 0 ||
				typeof(nickname) === 'undefined' || nickname.length === 0) {
				return false
			}
			const s = [...this.students, ...this.children]
			const res = s.filter(student => student._id === id)
			if (res.length > 0) {
				const student = res[0]
				const success = await users_co.updateStudentNickname(student.studentNo, nickname)
				if (success === true) {
					s.forEach(stu => {
						if (stu._id === id) {
							stu.nickName = nickname
						}
					})
				}
				return success
			}
			return false
		},
		async updateExpiredDate(type: number) {
			if (typeof(type) === 'undefined' ||
				(type !== 0 && type !== 1 && type !== 2)) {
				return false
			}
			const result = await users_co.updateExpiredDate(type, this.owner._id)
			if (result) {
				let duration = 30 * 24 * 60 * 60 * 1000
				let expireDate = Date.now() + 3 * duration
				if (type === 1) {
					expireDate = Date.now() + 6 * duration
				} else if (type === 2) {
					expireDate = Date.now() + 12 * duration
				}
				this.owner.isSubscribed = true
				this.owner.expireDate = expireDate
			}
			return result
		},
		// 更新头像url
		updateAvatarUrl(avatarUrl:string) {
			this.owner.avatarUrl = avatarUrl
			this.lastLoginInfo.tempFileUrl = avatarUrl
		},
		// 更新头像url
		updateTempFileUrl(tempFileUrl:string) {
			this.owner.tempFileUrl = tempFileUrl
		},
		// 更新头像文件id
		updateAvatarId(fileId: string) {
			this.owner.avatarId = fileId
		},
		// 更新昵称
		updateNickname(nickName:string) {
			const result = nickName !== this.lastLoginInfo.nickName
			this.owner.nickName = nickName
			return result;
		},
		// 更新身份id
		updateIdentity(openid:string = '', unionid:string = '', session_key:string = '') {
			if (typeof(openid) !== 'undefined') {
				this.owner.openid = openid
			}
			if (typeof(unionid) !== 'undefined') {
				this.owner.unionid = unionid
			}
			if (typeof(session_key) !== 'undefined') {
				this.owner.session_key = session_key
			}
		},
		// 更新角色
		async updateRoles(roleIds: RoleId[]) {
			const res = await users_co.updateRoles(this.owner._id, roleIds)
			if (res) {
				this.owner.roles = roleIds
			}
		},
		// 更新个性签名
		updateSignature(signature: string) {
			this.owner.signature = signature
			users_co.updateSignature(this.owner._id, signature, this.owner.from)
		},
		// 管理员 - 获取机构所有学员
		// 老师 - 获取匿名机构所有学员 + 有教学关系的学员
		// 家长 - 获取与孩子学习相同课程的学员
		// 学员 - 获取学习相同课程的学员
		async fetchStudents() {
			if (this.students.length > 0) {
				return
			}
			const result = await users_co.fetchStudents({
				userId: this.owner._id,
				studentNo: this.owner.studentNo,
				from: this.owner.from
			})
			for (let item of result) {
				if (typeof(item.avatarId) !== 'undefined' && item.avatarId.length > 0) {
					const res = await uniCloud.getTempFileURL({
						fileList:[item.avatarId]
					})
					if (typeof(res.fileList) !== 'undefined' && res.fileList.length > 0) {
						const { tempFileURL } = res.fileList[0]
						item.avatarUrl = tempFileURL
					}
				}
				const index = this.students.findIndex(stu => stu._id === item._id)
				if (index === -1) {
					this.students.push(item)
				}
			}
		},
		async fetchStudentsByIds(ids: string[]) {
			if (typeof(ids) === 'undefined' || ids.length === 0) {
				return []
			}
			const didLoadIds = this.students.map(s => s._id)
			const willLoadIds = ids.filter(id => !didLoadIds.includes(id))
			if (willLoadIds.length > 0) {
				const students = await users_co.fetchStudentsByIds(willLoadIds) as Student[]
				for (let item of students) {
					if (typeof(item.avatarId) !== 'undefined' && item.avatarId.length > 0) {
						const res = await uniCloud.getTempFileURL({
							fileList:[item.avatarId]
						})
						if (typeof(res.fileList) !== 'undefined' && res.fileList.length > 0) {
							const { tempFileURL } = res.fileList[0]
							item.avatarUrl = tempFileURL
						}
					}
					const index = this.students.findIndex(stu => stu._id === item._id)
					if (index === -1) {
						this.students.push(item)
					}
				}
			}
			return this.students.filter(s => ids.includes(s._id))
		},
		async fetchStudentsByNos(nos: string[]) {
			if (typeof(nos) === 'undefined' || nos.length === 0) {
				return []
			}
			const didLoadNos = this.students.map(s => s.studentNo)
			const willLoadNos = nos.filter(no => !didLoadNos.includes(no))
			if (willLoadNos.length > 0) {
				const students = await users_co.fetchStudentsByNos(willLoadNos) as Student[]
				for (let item of students) {
					if (typeof(item.avatarId) !== 'undefined' && item.avatarId.length > 0) {
						const res = await uniCloud.getTempFileURL({
							fileList:[item.avatarId]
						})
						if (typeof(res.fileList) !== 'undefined' && res.fileList.length > 0) {
							const { tempFileURL } = res.fileList[0]
							item.avatarUrl = tempFileURL
						}
					}
					const index = this.students.findIndex(stu => stu._id === item._id)
					if (index === -1) {
						this.students.push(item)
					}
				}
			}
			return this.students.filter(s => nos.includes(s.studentNo))
		},
		// 根据学号获取学员记录
		async fetchStudentByNo(studentNo:string) {
			if (typeof(studentNo) === 'undefined' || studentNo.length !== 9) {
				return {}
			}
			let index = this.students.findIndex(stu => stu.studentNo === studentNo)
			if (index !== -1) {
				return this.students[index]
			}
			const student = await users_co.fetchStudentByNo(studentNo)
			if (typeof(student) === 'undefined' || JSON.stringify(student) === '{}') {
				return {}
			}
			index = this.students.findIndex(stu => stu.studentNo === studentNo)
			if (index === -1) {
				this.students.push(student)
			}
			return student
		},
		async fetchStudentIdsByNos(studentNos: string[]) {
			if (typeof(studentNos) === 'undefined' || studentNos.length === 0) {
				return []
			}
			const didLoadNos = this.students.map(s => s.studentNo)
			const willLoadNos = studentNos.filter(no => !didLoadNos.includes(no))
			if (willLoadNos.length > 0) {
				await this.fetchStudentsByNos(willLoadNos)
			}
			return this.students.filter(s => studentNos.includes(s.studentNo))
								.map(s => s._id)
		},
		async fetchChildren(associateId:string) {
			if (typeof(associateId) === 'undefined' || associateId.length === 0) {
				return []
			}
			if (associateId === this.owner._id && this.children.length > 0) {
				return this.children
			}
			const data = await users_co.fetchChildren(associateId)
			if (typeof(data) !== 'undefined' && data.length > 0) {
				for (let item of data) {
					if (typeof(item.avatarId) !== 'undefined' && item.avatarId.length > 0) {
						const res = await uniCloud.getTempFileURL({
							fileList:[item.avatarId]
						})
						if (typeof(res.fileList) !== 'undefined' && res.fileList.length > 0) {
							const { tempFileURL } = res.fileList[0]
							item.avatarUrl = tempFileURL
						}
					}
					const index = this.children.findIndex(stu => stu._id === item._id)
					if (index === -1) {
						this.children.push(item)
					}
				}
			}
			return data
		},
		async fetchUserByPhoneNumber(phoneNumber: string) {
			if (typeof(phoneNumber) === 'undefined' || phoneNumber.length === 0) {
				return {}
			}
			const index = this.users.findIndex(user => user.mobile === phoneNumber)
			if (index !== -1) {
				return this.users[index]
			} else {
				const user = await users_co.fetchUserByPhoneNumber(phoneNumber) as User
				if (typeof(user) !== 'undefined' && JSON.stringify(user) !== '{}') {
					const index = this.users.findIndex(user => user.mobile === phoneNumber)
					if (index === -1) {
						this.users.push(user)
					}
					const response = await uniCloud.getTempFileURL({
						fileList:[user.avatarId]
					})
					const { tempFileURL } = response.fileList[0]
					user.avatarUrl = tempFileURL
				} else {
				}
				return user
			}
		},
		// 获取用户信息
		async fetchUsers(userIds: string[], type = '') {
			if (typeof(userIds) === 'undefined' || userIds.length === 0) {
				return []
			}
			let loadedUserIds:string[] = []
			if (type === 'student') {
				loadedUserIds = this.students.map(student => student._id)
			} else {
				loadedUserIds = this.users.map(user => user._id)
			}
			const s = userIds.filter(userId => !loadedUserIds.includes(userId))
			if (s.length > 0) {
				let res = []
				if (type === 'student') {
					res = await users_co.fetchStudentsByIds(s) as Student[]
					res.forEach(stu => {
						const index = this.students.findIndex(item => item._id === stu._id)
						if (index === -1) {
							this.students.push(stu)
						}
					})
				} else {
					res = await users_co.fetchUsers(s) as User[]
					res.forEach(user => {
						const index = this.users.findIndex(item => item._id === user._id)
						if (index === -1) {
							this.users.push(user)
						}
					})
				}
				if (res.length > 0) {
					let fileIds:string[] = []
					res.forEach(user => {
						if (typeof(user.avatarId) !== 'undefined' && user.avatarId.length > 0) {
							fileIds.push(user.avatarId)
						}
					})
					if (fileIds.length > 0) {
						const response = await uniCloud.getTempFileURL({
							fileList:fileIds
						})
						const fileList = response.fileList as {code:string, fileID:string, tempFileURL:string}[]
						res.forEach(user => {
							fileList.forEach(item => {
								if (item.code === "SUCCESS" && item.fileID === user.avatarId) {
									user.avatarUrl = item.tempFileURL
								}
							})
						})
					}
				}
			}
			if (type === 'student') {
				return this.students.filter(student => userIds.includes(student._id))
			} else {
				return this.users.filter(user => userIds.includes(user._id))
			}
		},
		/**
		 * 创建云端学生记录
		 */
		async createStudent(orgId:string, name:string, mobile:string) {
			if (typeof(orgId) === 'undefined' || orgId.length === 0 ||
				typeof(name) === 'undefined' || name.length === 0 ||
				typeof(mobile) === 'undefined' || mobile.length === 0) {
				return {}
			}
			const student:Student = await users_co.createStudent(orgId, name, mobile)
			if (JSON.stringify(student) !== '{}') {
				const orgStore = useOrgsStore()
				const orgs = orgStore.orgs.filter(org => org._id === orgId)
				if (orgs.length === 1) {
					const org = orgs[0]
					org.studentIds?.push(student._id)
				}
				const index = this.students.findIndex(stu => stu._id === student._id)
				if (index === -1) {
					this.students.push(student)
					if (typeof(student.avatarId) !== 'undefined' && 
						student.avatarId.length > 0 &&
						(typeof(student.avatarUrl) === 'undefined' || student.avatarUrl.length === 0)) {
						const response = await uniCloud.getTempFileURL({
							fileList:[student.avatarId]
						})
						const fileList = response.fileList as {code:string, fileID:string, tempFileURL:string}[]
						fileList.forEach(item => {
							if (item.code === "SUCCESS" && item.fileID === student.avatarId) {
								student.avatarUrl = item.tempFileURL
							}
						})
					}
				}
				return student._id
			} else {
				return ''
			}
		},
		async bindStudentNo(studentNo:string) {
			if (typeof(studentNo) === 'undefined' || studentNo.length === 0) {
				return false
			}
			const result = await users_co.bindStudentNo(studentNo, this.owner._id)
			if (result) {
				const res = this.students.filter(student => student.studentNo === studentNo)
				if (res.length === 1) {
					const student = res[0]
					if (!student.associateIds?.includes(this.owner._id)) {
						student.associateIds?.push(this.owner._id)
					}
				} else {
					const student = await this.fetchStudentByNo(studentNo) as Student
					if (!student.associateIds?.includes(this.owner._id)) {
						student.associateIds?.push(this.owner._id)
					}
				}
			}
			return result
		},
		async unbindStudentNo(studentNo:string) {
			if (typeof(studentNo) === 'undefined' || studentNo.length === 0) {
				return false
			}
			const result = await users_co.unbindStudentNo(studentNo, this.owner._id)
			if (result) {
				const res = this.students.filter(student => student.studentNo === studentNo)
				if (res.length === 1) {
					const student = res[0]
					const index = student.associateIds?.findIndex(id => id === this.owner._id)
					if (typeof(index) !== 'undefined' && index !== -1) {
						student.associateIds?.splice(index, 1)
					}
				}
			}
			return result
		},
		async loadAllEntries(refresh=false) {
			if (this.entries.length > 0 && refresh !== true) {
				return
			}
			try {
				this.entries.length = 0
				let loop = true
				let before = Date.now()
				while(loop) {
					const entries = await course_co.fetchEntries(
						this.owner._id,
						this.owner.studentNo, 
						before,
						this.owner.from
					) as Entry[]
					loop = false
					entries.forEach(entry => {
						const index = this.entries.findIndex(e => e._id === entry._id)
						if (index === -1) {
							this.entries.push(entry)
							loop = true
						}
					})
					if (entries.length) {
						const entry = entries.slice(-1)[0]
						before = entry.modifyDate
					}
				}
			} catch(e) {
				const that = this
				uni.showModal({
					title: '嗒嗒课吧',
					content: '初始数据加载失败, 请重新加载',
					showCancel: false,
					success: async function (res) {
						if (res.confirm) {
							uni.showLoading({
								title: "加载初始数据",
								mask: true
							})
							await that.loadAllEntries()
							uni.hideLoading()
						}
					}
				})
			}
		},
		fetchEntriesWithStudentNo(studentNo: string, orgIds:string[] = []) {
			if (typeof(studentNo) === 'undefined' || studentNo.length === 0) {
				return []
			}
			const data:Entry[] = this.entries.filter(
				entry => entry.studentId === studentNo && 
				(orgIds.length > 0? orgIds.includes(entry.orgId): true)
			)
			return data
		},
		fetchEntriesWithTeacherId(teacherId: string, orgIds:string[] = []) {
			if (typeof(teacherId) === 'undefined' || teacherId.length === 0) {
				return []
			}
			const data:Entry[] = this.entries.filter(
				entry => entry.teacherId === teacherId && 
				(orgIds.length > 0? orgIds.includes(entry.orgId): true)
			)
			return data
		},
		async fetchPhoneNumber(code:string) {
			if (typeof(code) === 'undefined' || code.length === 0) {
				return ''
			}
			const result = await users_co.fetchPhoneNumber(code, this.owner._id) as {
				data : {
					phone_info: {
						phoneNumber: string
					}
				}
			}
			const { phoneNumber } = result.data.phone_info
			this.owner.mobile = phoneNumber
			return phoneNumber
		},
		async unbindPhoneNumber() {
			const result = await users_co.unbindPhoneNumber(this.owner._id)
			if (result) {
				this.owner.mobile = ""
			}
			return result
		},
		async createActivityId() {
			const result = await users_co.createActivityId()
			const { activity_id } = result
			return activity_id
		}
	}
})