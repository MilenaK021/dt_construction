import axios from 'axios'

const base = axios.create({ baseURL: '/api' })

export const getProjects    = ()         => base.get('/projects')
export const getProject     = (id)       => base.get(`/projects/${id}`)
export const getTasks       = (id)       => base.get(`/projects/${id}/tasks`)
export const getMeetingInvitation = (id) => base.get(`/projects/${id}/meeting-invitation`)
export const submitReport   = (data)     => base.post('/reports/submit', data)
export const askQuestion    = (data)     => base.post('/ask', data)