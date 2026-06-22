const XLSX = require('xlsx');

const rows = [];
rows.push(['full_name', 'gender', 'birth_date', 'death_date', 'is_living', 'parent_name']);

for (let i = 1; i <= 50; i++) {
  const gender = i % 2 === 0 ? 'male' : 'female';
  const parentName = i > 1 && i <= 10 ? '陈祖' : i > 10 && i <= 20 ? '陈宗' : i > 20 && i <= 30 ? '陈明' : i > 30 && i <= 40 ? '陈伟' : i > 40 && i <= 50 ? '陈杰' : undefined;
  
  rows.push([
    '陈' + ['伟', '杰', '明', '华', '强', '勇', '军', '涛', '亮', '磊'][i % 10] + i,
    gender,
    '19' + Math.floor(50 + Math.random() * 40) + '-' + String(Math.floor(1 + Math.random() * 12)).padStart(2, '0') + '-' + String(Math.floor(1 + Math.random() * 28)).padStart(2, '0'),
    Math.random() > 0.8 ? '20' + Math.floor(10 + Math.random() * 20) + '-' + String(Math.floor(1 + Math.random() * 12)).padStart(2, '0') + '-' + String(Math.floor(1 + Math.random() * 28)).padStart(2, '0') : '',
    Math.random() > 0.8 ? 'false' : 'true',
    parentName
  ]);
}

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

XLSX.writeFile(wb, 'test_import_50.xlsx');
console.log('Excel file generated');
