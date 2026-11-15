import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { sourceFiles } from './source-files'

// A form submitted before React has hydrated is sent by the browser itself. Without a method that
// is a GET to the same page, and every named field (an email, a phone number, a note about an
// athlete) lands in the URL: browser history, server logs, the Referer header (docs/e2e.md,
// 15 Nov 2026). A form handled by onSubmit therefore says method="post", or has its own action.
// The files are parsed as TSX, so an attribute's place in the tag or an arrow inside it does not
// matter.

type Form = { file: string; line: number; onSubmit: boolean; action: boolean; post: boolean; spread: boolean }

function forms(file: string): Form[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: Form[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'form') {
      const attributes = node.attributes.properties
      const named = (name: string) => attributes.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === name) as ts.JsxAttribute | undefined
      const method = named('method')?.initializer
      found.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        onSubmit: Boolean(named('onSubmit')),
        action: Boolean(named('action')),
        post: Boolean(method && ts.isStringLiteral(method) && method.text.toLowerCase() === 'post'),
        spread: attributes.some(item => ts.isJsxSpreadAttribute(item)),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const all = sourceFiles(['app', 'components'], /\.tsx$/).flatMap(forms)

describe('forms handled by onSubmit', () => {
  it('are found by the parser (the check is not passing on nothing)', () => {
    expect(all.filter(form => form.onSubmit).length).toBeGreaterThanOrEqual(20)
  })

  it('never fall back to a GET that puts the fields in the URL', () => {
    const offenders = all.filter(form => form.onSubmit && !form.action && !form.post).map(form => `${form.file}:${form.line}`)
    expect(offenders).toEqual([])
  })

  it('do not hide their attributes in a spread, where the check cannot see them', () => {
    expect(all.filter(form => form.spread).map(form => `${form.file}:${form.line}`)).toEqual([])
  })
})
