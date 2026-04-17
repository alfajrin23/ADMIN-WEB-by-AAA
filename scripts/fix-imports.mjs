import fs from 'fs';
import path from 'path';

const domainMapping = {
  createProjectAction: 'project.action',
  updateProjectAction: 'project.action',
  updateManyProjectsAction: 'project.action',
  deleteProjectAction: 'project.action',
  deleteSelectedProjectsAction: 'project.action',
  
  createExpenseAction: 'expense.action',
  updateExpenseAction: 'expense.action',
  updateManyExpensesAction: 'expense.action',
  deleteManyExpensesAction: 'expense.action',
  deleteExpenseAction: 'expense.action',
  
  createAttendanceAction: 'attendance.action',
  updateAttendanceAction: 'attendance.action',
  prepareAttendanceExportAction: 'attendance.action',
  deleteAttendanceAction: 'attendance.action',
  
  confirmPayrollPaidAction: 'payroll.action',
  importExcelTemplateAction: 'import.action',
  updateActivityLogAction: 'log.action',
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if(!file.includes('node_modules') && !file.includes('.next')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const allFiles = walk('src');

for(const file of allFiles) {
  if (file === 'src/app/actions.ts' || file.includes('src/app/actions/')) continue;
  
  let content = fs.readFileSync(file, 'utf8');

  let lines = content.split('\n');
  let newLines = [];
  for (let line of lines) {
     if (line.includes('@/app/actions"') || line.includes("@/app/actions'")) {
         for (const [func, targetFile] of Object.entries(domainMapping)) {
            if (line.includes(func)) {
               line = line.replace('@/app/actions', '@/app/actions/' + targetFile);
            }
         }
     }
     newLines.push(line);
  }

  if (newLines.join('\n') !== content) {
      fs.writeFileSync(file, newLines.join('\n'));
      console.log('Fixed', file);
  }
}
