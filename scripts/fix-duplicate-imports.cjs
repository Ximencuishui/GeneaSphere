const fs = require('fs')
const file = 'apps/web/src/utils/request.ts'
let c = fs.readFileSync(file, 'utf8')
const matches = [...c.matchAll(/import axios from 'axios';/g)]
console.log('axios import occurrences:', matches.length)
if (matches.length > 1) {
  // 删除所有但保留第一个
  const firstEnd = matches[0].index + matches[0][0].length
  const before = c.slice(0, firstEnd)
  const after = c.slice(firstEnd).replace(/import axios from 'axios';\n?/g, '')
  c = before + after
  fs.writeFileSync(file, c)
}
const matches2 = [...c.matchAll(/import \{ ElMessage \} from 'element-plus';/g)]
console.log('ElMessage import occurrences:', matches2.length)
if (matches2.length > 1) {
  const firstEnd = matches2[0].index + matches2[0][0].length
  const before = c.slice(0, firstEnd)
  const after = c.slice(firstEnd).replace(/import \{ ElMessage \} from 'element-plus';\n?/g, '')
  c = before + after
  fs.writeFileSync(file, c)
}
const matches3 = [...c.matchAll(/import router from '@\/router';/g)]
console.log('router import occurrences:', matches3.length)
if (matches3.length > 1) {
  const firstEnd = matches3[0].index + matches3[0][0].length
  const before = c.slice(0, firstEnd)
  const after = c.slice(firstEnd).replace(/import router from '@\/router';\n?/g, '')
  c = before + after
  fs.writeFileSync(file, c)
}
console.log('After cleanup, total lines:', fs.readFileSync(file, 'utf8').split(/\r?\n/).length)
