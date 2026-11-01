import { describe, expect, it } from 'vitest'
import {
  formatAmountInput,
  formatMoney,
  formatSignedAmountInput,
  parseAmountInput,
  parseSignedAmountInput,
  signedAmountToInput,
} from '@/core/money'
import { newId } from '@/core/id'

describe('amount input', () => {
  it('groups digits as the user types, per locale', () => {
    expect(formatAmountInput('1234567', 'id-ID')).toBe('1.234.567')
    expect(formatAmountInput('1,234567', 'en-US')).toBe('1,234,567')
    expect(formatAmountInput('0012a3', 'id-ID')).toBe('123')
    expect(formatAmountInput('1.500,256', 'id-ID')).toBe('1.500,25')
    expect(formatAmountInput(',5', 'id-ID')).toBe('0,5')
  })

  it('parses back to a number', () => {
    expect(parseAmountInput('1.234.567', 'id-ID')).toBe(1234567)
    expect(parseAmountInput('1.500,25', 'id-ID')).toBe(1500.25)
    expect(parseAmountInput('1,500.25', 'en-US')).toBe(1500.25)
    expect(parseAmountInput('', 'id-ID')).toBeNaN()
  })
})

describe('signed amount input', () => {
  it('keeps a leading minus, in either form', () => {
    expect(formatSignedAmountInput('-1234567', 'id-ID')).toBe('-1.234.567')
    expect(formatSignedAmountInput('−25000', 'en-US')).toBe('-25,000')
    expect(formatSignedAmountInput('12-3', 'en-US')).toBe('123')
    expect(formatSignedAmountInput('-', 'en-US')).toBe('-')
  })

  it('round-trips negative balances', () => {
    expect(signedAmountToInput(-25000.5, 'id-ID')).toBe('-25.000,5')
    expect(parseSignedAmountInput('-25.000,5', 'id-ID')).toBe(-25000.5)
    expect(parseSignedAmountInput('1,500', 'en-US')).toBe(1500)
    expect(parseSignedAmountInput('-', 'en-US')).toBeNaN()
  })
})

describe('formatMoney', () => {
  it('hides decimals for whole amounts', () => {
    expect(formatMoney(26404051, 'IDR', 'id-ID')).toMatch(/^Rp\s26\.404\.051$/)
    expect(formatMoney(10.5, 'IDR', 'id-ID')).toMatch(/10,50$/)
  })
})

describe('newId', () => {
  it('makes v4 UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
