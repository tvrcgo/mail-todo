export const LIST_PREFIX = 'Todo-'
export const INBOX_PATH = 'INBOX'

export const HEADER_ID = 'X-Todo-Id'
export const HEADER_REV = 'X-Todo-Rev'
export const HEADER_DUE = 'X-Todo-Due'

export const KNOWN_TODO_HEADERS = [HEADER_ID, HEADER_REV, HEADER_DUE]


export const SNAPSHOT_VERSION = 1
export const APP_NAME = 'MailTodo'

export const IPC = {
  state: 'mailbox:state',
  changed: 'mailbox:changed',
  refresh: 'mailbox:refresh',
  login: 'account:login',
  logout: 'account:logout',
  settings: 'account:settings',
  saveSettings: 'account:save-settings',
  createTask: 'todo:create',
  updateTask: 'todo:update',
  setDone: 'todo:set-done',
  setImportant: 'todo:set-important',
  deleteTask: 'todo:delete',
  loadNotes: 'todo:notes',
  createList: 'lists:create',
  deleteList: 'lists:delete',
  focus: 'window:focus',
} as const
