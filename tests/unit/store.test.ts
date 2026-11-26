import { describe, expect, it } from 'vitest'

import { decodeBody } from '../../electron/mail/store'

function build(headerLines: string[], body: string | Buffer): Buffer {
  const head = Buffer.from(headerLines.join('\r\n') + '\r\n\r\n', 'utf8')
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  return Buffer.concat([head, payload])
}

describe('decodeBody', () => {
  it('解码 base64 正文（本应用写出的格式）', () => {
    const encoded = Buffer.from('第一行\n第二行', 'utf8').toString('base64')
    const raw = build(['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'], encoded)
    expect(decodeBody(raw)).toBe('第一行\n第二行')
  })

  it('解码 quoted-printable', () => {
    const raw = build(
      ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: quoted-printable'],
      '=E4=BD=A0=E5=A5=BD',
    )
    expect(decodeBody(raw)).toBe('你好')
  })

  it('纯 7bit 正文原样返回', () => {
    const raw = build(['Content-Type: text/plain; charset=utf-8'], 'plain text')
    expect(decodeBody(raw)).toBe('plain text')
  })

  it('multipart/alternative 取第一部分文本', () => {
    const body = [
      '--BOUND',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      '纯文本部分',
      '--BOUND',
      'Content-Type: text/html; charset=UTF-8',
      '',
      '<p>HTML 部分</p>',
      '--BOUND--',
    ].join('\r\n')
    const raw = build(['Content-Type: multipart/alternative; boundary="BOUND"'], body)
    expect(decodeBody(raw)).toBe('纯文本部分')
  })

  it('没有分隔空行时返回空串', () => {
    expect(decodeBody(Buffer.from('Content-Type: text/plain', 'utf8'))).toBe('')
  })

  it('GBK 正文按声明编码解码', () => {
    const gbkBytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
    const raw = build(['Content-Type: text/plain; charset=gbk'], gbkBytes)
    expect(decodeBody(raw)).toBe('你好')
  })
})
