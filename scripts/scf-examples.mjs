// Derives the example households from the Federal Reserve's Survey of Consumer Finances.
//
//   1. Download the 2022 "Summary Extract Public Data" (CSV version) from
//      https://www.federalreserve.gov/econres/scfindex.htm
//      (direct link: https://www.federalreserve.gov/econres/files/scfp2022excel.zip)
//   2. Unzip it and run:  node scripts/scf-examples.mjs path/to/SCFP2022.csv
//
// For each group below it prints weighted medians (using the survey weight WGT) of the
// dollar amounts Ripple needs. The medians are computed variable by variable, so each example
// is a typical household for its group, not one family's actual record. The survey's summary
// extract has no interest rates and no minimum payments; those stay assumptions in
// api/src/Ripple.Api/Examples.cs and are labelled as such in the app.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/scf-examples.mjs path/to/SCFP2022.csv')
  process.exit(1)
}

// AGECL: 1 = under 35, 2 = 35-44, 3 = 45-54, 4 = 55-64, 5 = 65-74, 6 = 75 or older.
const groups = [
  {
    slug: 'under-35-card-and-student-loan',
    label: 'Under 35, carrying a card balance and a student loan',
    where: (r) => r.AGECL === 1 && r.CCBAL > 0 && r.EDN_INST > 0,
    report: ['CCBAL', 'EDN_INST', 'LIQ', 'INCOME'],
    payment: 'PAYEDU',
  },
  {
    slug: '35-to-54-card-and-car-loan',
    label: '35 to 54, carrying a card balance and a car loan',
    where: (r) => (r.AGECL === 2 || r.AGECL === 3) && r.CCBAL > 0 && r.VEH_INST > 0,
    report: ['CCBAL', 'VEH_INST', 'LIQ', 'INCOME'],
    payment: 'PAYVEH',
  },
  {
    slug: 'card-and-personal-loan',
    label: 'Any age, carrying a card balance and another instalment loan (personal, medical and similar)',
    where: (r) => r.CCBAL > 0 && r.OTH_INST > 0,
    report: ['CCBAL', 'OTH_INST', 'LIQ', 'INCOME'],
    payment: 'PAYILN',
  },
]

const needed = ['WGT', 'AGECL', 'CCBAL', 'EDN_INST', 'VEH_INST', 'OTH_INST', 'LIQ', 'INCOME']
// Monthly loan payments are spread over several columns, one per loan.
const paymentColumns = {
  PAYEDU: ['PAYEDU1', 'PAYEDU2', 'PAYEDU3', 'PAYEDU4', 'PAYEDU5', 'PAYEDU6', 'PAYEDU7'],
  PAYVEH: ['PAYVEH1', 'PAYVEH2', 'PAYVEH3', 'PAYVEH4', 'PAYVEHM'],
  PAYILN: ['PAYILN1', 'PAYILN2', 'PAYILN3', 'PAYILN4', 'PAYILN5', 'PAYILN6', 'PAYILN7'],
}
const samples = groups.map(() => [])

let columns = null
for await (const line of createInterface({ input: createReadStream(file) })) {
  const cells = line.split(',')
  if (!columns) {
    columns = Object.fromEntries([...needed, ...Object.values(paymentColumns).flat()].map((name) => [name, cells.indexOf(name)]))
    const missing = Object.keys(columns).filter((name) => columns[name] < 0)
    if (missing.length) throw new Error(`Columns not found: ${missing.join(', ')}`)
    continue
  }
  const row = Object.fromEntries(needed.map((name) => [name, Number(cells[columns[name]])]))
  for (const [name, parts] of Object.entries(paymentColumns)) row[name] = parts.reduce((sum, part) => sum + Number(cells[columns[part]]), 0)
  groups.forEach((group, i) => group.where(row) && samples[i].push(row))
}

/** The value at which half of the weighted population sits below. */
function weightedMedian(rows, name) {
  const sorted = [...rows].sort((a, b) => a[name] - b[name])
  const half = sorted.reduce((sum, r) => sum + r.WGT, 0) / 2
  let seen = 0
  for (const r of sorted) {
    seen += r.WGT
    if (seen >= half) return r[name]
  }
  return NaN
}

groups.forEach((group, i) => {
  const rows = samples[i]
  // The file holds five imputed copies of every household, so divide the record count by five.
  console.log(`\n${group.label}  (${group.slug})`)
  console.log(`  households in sample: ${Math.round(rows.length / 5)}`)
  for (const name of group.report) console.log(`  median ${name}: ${Math.round(weightedMedian(rows, name))}`)
  if (group.payment) {
    // Not everyone with a loan was paying on it (student loans were paused in 2022), so take
    // the median among those making payments.
    const paying = rows.filter((r) => r[group.payment] > 0)
    console.log(`  median monthly ${group.payment} among the ${Math.round(paying.length / 5)} making payments: ${Math.round(weightedMedian(paying, group.payment))}`)
  }
})
