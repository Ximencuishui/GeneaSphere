import request from '@/utils/request'
import type {
  UserAlbum,
  UserPhoto,
  UserMessage,
  UserStorageInfo,
  Pagination,
  SpacePrivacyLevel,
} from '@/types'

const trimId = (s: string | number) => String(s)

/** 个人空间 API */
export const personalSpaceApi = {
  // ========== 存储用量 ==========
  storage: {
    get: () =>
      request.get<UserStorageInfo>('/api/personal-space/storage'),
  },

  // ========== 相册 ==========
  albums: {
    list: (sort?: string) =>
      request.get<UserAlbum[]>('/api/personal-space/albums', {
        params: { sort },
      }),

    create: (data: {
      name: string
      description?: string
      default_privacy?: SpacePrivacyLevel
    }) => request.post<UserAlbum>('/api/personal-space/albums', data),

    update: (
      id: string | number,
      data: {
        name?: string
        description?: string
        default_privacy?: SpacePrivacyLevel
        cover_photo_id?: string | number
      },
    ) => request.put(`/api/personal-space/albums/${trimId(id)}`, data),

    delete: (id: string | number) =>
      request.delete(`/api/personal-space/albums/${trimId(id)}`),
  },

  // ========== 照片 ==========
  photos: {
    list: (params?: {
      album_id?: string | number
      page?: number
      pageSize?: number
    }) =>
      request.get<Pagination<UserPhoto>>('/api/personal-space/photos', {
        params: {
          ...params,
          album_id: params?.album_id ? trimId(params.album_id) : undefined,
        },
      }),

    upload: (data: {
      file: File
      album_id: string | number
      location_name: string
      taken_year: number
      taken_date?: string
      description?: string
      privacy?: SpacePrivacyLevel
    }) => {
      const form = new FormData()
      form.append('file', data.file)
      form.append('album_id', String(data.album_id))
      form.append('location_name', data.location_name)
      form.append('taken_year', String(data.taken_year))
      if (data.taken_date) form.append('taken_date', data.taken_date)
      if (data.description) form.append('description', data.description)
      if (data.privacy) form.append('privacy', data.privacy)
      return request.post('/api/personal-space/photos/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },

    update: (
      id: string | number,
      data: {
        location_name?: string
        taken_year?: number
        taken_date?: string
        description?: string
        privacy?: SpacePrivacyLevel
      },
    ) => request.put(`/api/personal-space/photos/${trimId(id)}`, data),

    delete: (id: string | number) =>
      request.delete(`/api/personal-space/photos/${trimId(id)}`),

    move: (id: string | number, targetAlbumId: string | number) =>
      request.post(`/api/personal-space/photos/${trimId(id)}/move`, {
        target_album_id: trimId(targetAlbumId),
      }),
  },

  // ========== 留言板 ==========
  messages: {
    list: (params?: {
      year?: number
      page?: number
      pageSize?: number
    }) =>
      request.get<Pagination<UserMessage>>('/api/personal-space/messages', {
        params,
      }),

    create: (data: {
      content: string
      privacy?: SpacePrivacyLevel
      image?: File
    }) => {
      const form = new FormData()
      form.append('content', data.content)
      if (data.privacy) form.append('privacy', data.privacy)
      if (data.image) form.append('image', data.image)
      return request.post('/api/personal-space/messages', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },

    update: (id: string | number, data: { content: string }) =>
      request.put(`/api/personal-space/messages/${trimId(id)}`, data),

    delete: (id: string | number) =>
      request.delete(`/api/personal-space/messages/${trimId(id)}`),
  },
}

export default personalSpaceApi
