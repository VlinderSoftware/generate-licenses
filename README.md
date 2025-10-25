# Generate Licenses Action

A GitHub Action that generates comprehensive license information for npm dependencies, including CSV export, license text downloads, and HTML report generation.

## Features

- **CSV Generation**: Creates a complete list of all npm dependencies with their licenses
- **License Text Downloads**: Downloads full license texts from unpkg.com with intelligent caching
- **HTML Report**: Generates a beautiful, searchable HTML page displaying all licenses
- **Manual Overrides**: Supports manual license overrides for packages with unknown or incorrect licenses
- **Caching**: Implements GitHub Actions caching to avoid redundant downloads

## Usage

```yaml
- name: Generate Open Source Licenses
  uses: VlinderSoftware/generate-licenses@v1
  with:
    working-directory: 'frontend'
    node-version: '22'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `working-directory` | Directory containing package.json (e.g., frontend) | Yes | - |
| `node-version` | Node.js version to use | No | `22` |

## What it does

1. **Sets up environments**: Configures Node.js and Python environments
2. **Installs dependencies**: Installs required tools (`license-checker`, `jinja2`, `js-yaml`)
3. **Generates CSV**: Scans all npm dependencies and creates a CSV with package info and licenses
4. **Downloads licenses**: Fetches license texts from unpkg.com with caching
5. **Creates HTML report**: Uses Jinja2 template to generate a professional HTML page
6. **Provides summary**: Shows statistics about packages and licenses

## Output Files

- `licenses/licenses.csv` - Complete dependency list with license information
- `licenses/texts/` - Directory containing downloaded license files
- `public/licenses.html` - Generated HTML report for web display

## License Override Support

The action supports manual license overrides through a `.github/license-overrides.yml` file in your repository. This is useful for packages with unknown or incorrectly detected licenses.

Example override file:
```yaml
overrides:
  my-package@1.2.3:
    license: "MIT"
    licenseUrl: "https://github.com/owner/repo/blob/main/LICENSE"
    notes: "License verified from repository"
```

## Example Workflow

```yaml
name: Build Frontend
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install dependencies
        run: npm install
        working-directory: frontend
        
      - name: Generate Open Source Licenses
        uses: VlinderSoftware/generate-licenses@v1
        with:
          working-directory: 'frontend'
          
      - name: Build application
        run: npm run build
        working-directory: frontend
```

## Template Customization

The action generates an HTML page using a Jinja2 template. You can customize the appearance by providing your own template:

### Using a Custom Template

1. **Copy the default template to your project:**
   ```bash
   # If using the npm package
   cp node_modules/@vlindersoftware/generate-licenses/templates/licenses.html.j2 licenses.html.j2
   
   # Or download from GitHub
   curl -o licenses.html.j2 https://raw.githubusercontent.com/VlinderSoftware/generate-licenses/main/templates/licenses.html.j2
   ```

2. **Customize the template** to match your application's styling
3. **Run the action** - it will automatically detect and use your local template

### Template Resolution Order

The HTML generator looks for templates in this order:
1. **Local template**: `./licenses.html.j2` (in your working directory)
2. **Package template**: Built-in template from the npm package
3. **Legacy template**: Fallback for older versions

### Template Variables

Your custom template has access to these variables:
- `licenses` - List of license objects with `name`, `version`, `license`, `license_url`, `license_text`
- `license_counts` - Dictionary of license types and their counts  
- `total_count` - Total number of packages
- `copyleft_licenses` - List of packages with copyleft licenses

### Example Customization

```html
<!DOCTYPE html>
<html>
<head>
    <title>{{ total_count }} Open Source Licenses - My App</title>
    <link rel="stylesheet" href="/my-app-styles.css">
</head>
<body>
    <h1>Our {{ total_count }} Open Source Dependencies</h1>
    <!-- Your custom styling here -->
</body>
</html>
```

## Requirements

- Node.js project with `package.json`
- The following npm scripts should be available:
  - `licenses:csv` - Generate CSV using license-checker
  - `licenses:download` - Download license texts
  - `licenses:html` - Generate HTML report
  - `licenses:generate` - Run all license generation steps

## Dependencies

The action automatically installs:
- `license-checker` (npm) - For scanning dependencies
- `js-yaml` (npm) - For parsing override configuration
- `Jinja2` (Python) - For HTML template rendering

## Caching

The action uses GitHub Actions cache to store downloaded license files, with cache keys based on the generated CSV content. This significantly speeds up subsequent runs when dependencies haven't changed.

## License

This action is part of the DocXchange project and is subject to the same license terms.