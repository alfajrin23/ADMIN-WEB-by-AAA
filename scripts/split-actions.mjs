import { Project, SyntaxKind } from "ts-morph";
import fs from "fs";

async function splitActions() {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const sourceFile = project.getSourceFileOrThrow("src/app/actions.ts");

  const utilsFile = project.createSourceFile("src/app/actions/utils.ts", "", { overwrite: true });
  const projectFile = project.createSourceFile("src/app/actions/project.action.ts", "", { overwrite: true });
  const expenseFile = project.createSourceFile("src/app/actions/expense.action.ts", "", { overwrite: true });
  const attendanceFile = project.createSourceFile("src/app/actions/attendance.action.ts", "", { overwrite: true });
  const payrollFile = project.createSourceFile("src/app/actions/payroll.action.ts", "", { overwrite: true });
  const importFile = project.createSourceFile("src/app/actions/import.action.ts", "", { overwrite: true });
  const logFile = project.createSourceFile("src/app/actions/log.action.ts", "", { overwrite: true });

  const domainFiles = {
    "Project": projectFile,
    "Expense": expenseFile,
    "Attendance": attendanceFile,
    "Payroll": payrollFile,
    "Import": importFile,
    "Log": logFile,
  };

  for (const file of Object.values(domainFiles)) {
    file.addStatements('"use server";\n');
  }

  const imports = sourceFile.getImportDeclarations().map(imp => imp.getText());
  utilsFile.addStatements(imports.join('\n'));
  
  const allNodes = sourceFile.getStatements();
  const utilsNames = [];
  
  // Track strictly originally exported items
  const originalExportedNames = new Set();
  for (const node of allNodes) {
     if (node.hasModifier && node.hasModifier(SyntaxKind.ExportKeyword)) {
         if (node.getName) originalExportedNames.add(node.getName());
         else if (node.getDeclarations) node.getDeclarations().forEach(d => originalExportedNames.add(d.getName()));
     }
  }

  for (const node of allNodes) {
    if (node.getKind() === SyntaxKind.ImportDeclaration) continue;
    if (node.getText().trim() === '"use server";') continue;

    const nameNode = node.getName ? node.getName() : (node.getDeclarations ? node.getDeclarations()[0].getName() : "");
    const isOriginalExport = originalExportedNames.has(nameNode);

    if (!isOriginalExport) {
      if (node.getKind() === SyntaxKind.FunctionDeclaration || node.getKind() === SyntaxKind.VariableStatement || node.getKind() === SyntaxKind.TypeAliasDeclaration) {
        if (!node.hasModifier(SyntaxKind.ExportKeyword) && node.addModifier) {
           node.addModifier("export");
        }
      }
      utilsFile.addStatements(node.getText());
      
      if (node.getName) {
         utilsNames.push(node.getName());
      } else if (node.getDeclarations) {
         node.getDeclarations().forEach(d => utilsNames.push(d.getName()));
      }
    }
  }

  for (const node of allNodes) {
    const nameNode = node.getName ? node.getName() : (node.getDeclarations ? node.getDeclarations()[0].getName() : "");
    const isOriginalExport = originalExportedNames.has(nameNode);

    if (isOriginalExport && node.getKind() === SyntaxKind.FunctionDeclaration) {
      const name = nameNode || "";
      let targetFile = null;
      if (name.includes("Project")) targetFile = projectFile;
      else if (name.includes("Expense")) targetFile = expenseFile;
      else if (name.includes("Attendance")) targetFile = attendanceFile;
      else if (name.includes("Payroll")) targetFile = payrollFile;
      else if (name.includes("Import") || name.includes("importExcelTemplateAction")) targetFile = importFile;
      else if (name.includes("ActivityLog")) targetFile = logFile;

      if (targetFile) {
        targetFile.addStatements(node.getText());
      }
    }
  }

  for (const file of Object.values(domainFiles)) {
    file.insertStatements(1, imports.join('\n'));
    const uniqueUtils = [...new Set(utilsNames.filter(Boolean))];
    if (uniqueUtils.length > 0) {
      file.insertStatements(2, `import { ${uniqueUtils.join(", ")} } from "./utils";\n`);
    }
  }

  await project.save();
  console.log("Splitting finished successfully.");
}

splitActions().catch(console.error);
