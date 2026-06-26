const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'app/page.tsx',
  'components/MyWorkView.tsx',
  'components/ItemPanel.tsx',
  'components/KanbanView.tsx',
  'components/GroupFooter.tsx',
  'components/FilterBar.tsx'
];

const classMap = {
  'bg-white': 'dark:bg-slate-900',
  'bg-gray-50': 'dark:bg-slate-800',
  'bg-gray-100': 'dark:bg-slate-700',
  'bg-gray-200': 'dark:bg-slate-600',
  'text-gray-900': 'dark:text-gray-100',
  'text-gray-800': 'dark:text-gray-100',
  'text-gray-700': 'dark:text-gray-200',
  'text-gray-600': 'dark:text-gray-300',
  'text-gray-500': 'dark:text-gray-400',
  'text-gray-400': 'dark:text-gray-500',
  'border-gray-100': 'dark:border-slate-700',
  'border-gray-200': 'dark:border-slate-600',
  'border-gray-300': 'dark:border-slate-500',
  'shadow-sm': 'dark:shadow-none'
};

const regexes = Object.entries(classMap).map(([light, dark]) => {
  // Matches the light class exactly, not followed by dark class already
  return {
    light,
    dark,
    regex: new RegExp(`(?<!dark:)\\b${light}\\b(?!\\s+${dark})`, 'g')
  };
});

filesToUpdate.forEach(relPath => {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  regexes.forEach(({ light, dark, regex }) => {
    if (regex.test(content)) {
      content = content.replace(regex, `${light} ${dark}`);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(fullPath, content);
    console.log(`Updated ${relPath}`);
  }
});
