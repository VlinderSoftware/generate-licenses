#!/usr/bin/env python3

"""
Generate HTML page from licenses CSV and downloaded license files
Uses Jinja2 template to create a styled page matching the app's CSS
"""

import csv
import os
import sys
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SCRIPT_DIR.parent  # One level up from scripts/
WORKING_DIR = Path.cwd()
CSV_FILE = WORKING_DIR / 'licenses' / 'licenses.csv'
LICENSES_DIR = WORKING_DIR / 'licenses' / 'texts'
OUTPUT_FILE = WORKING_DIR / 'public' / 'licenses.html'

# Template resolution order:
# 1. User's local template (working directory)
# 2. Package template (installed with action)
# 3. Legacy template (for backward compatibility)
LOCAL_TEMPLATE = WORKING_DIR / 'licenses.html.j2'
PACKAGE_TEMPLATE = PACKAGE_DIR / 'templates' / 'licenses.html.j2'
LEGACY_TEMPLATE = SCRIPT_DIR / 'licenses.html.j2'

def find_template():
    """Find the template file, prioritizing user's local template"""
    if LOCAL_TEMPLATE.exists():
        print(f"Using local template: {LOCAL_TEMPLATE}")
        return LOCAL_TEMPLATE
    elif PACKAGE_TEMPLATE.exists():
        print(f"Using package template: {PACKAGE_TEMPLATE}")
        return PACKAGE_TEMPLATE
    elif LEGACY_TEMPLATE.exists():
        print(f"Using legacy template: {LEGACY_TEMPLATE}")
        return LEGACY_TEMPLATE
    else:
        raise FileNotFoundError(
            f"No template found. Searched:\n"
            f"  1. Local: {LOCAL_TEMPLATE}\n"
            f"  2. Package: {PACKAGE_TEMPLATE}\n"
            f"  3. Legacy: {LEGACY_TEMPLATE}\n"
            f"\nTo customize the template, copy the default template to your project root:\n"
            f"  cp {PACKAGE_TEMPLATE} {LOCAL_TEMPLATE}"
        )

def sanitize_filename(name, version):
    """Create sanitized filename matching download script"""
    def sanitize(s):
        return ''.join(c if c.isalnum() or c in '.-' else '_' for c in s)
    return f"{sanitize(name)}-{sanitize(version)}.txt"

def load_licenses():
    """Load license data from CSV"""
    licenses = []
    
    if not CSV_FILE.exists():
        print(f"Error: CSV file not found: {CSV_FILE}")
        sys.exit(1)
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row['Component Name']
            version = row['Version']
            license_id = row['License (SPDX ID)']
            license_url = row['License URL']
            
            # Try to load license text
            license_filename = sanitize_filename(name, version)
            license_path = LICENSES_DIR / license_filename
            
            license_text = None
            if license_path.exists():
                with open(license_path, 'r', encoding='utf-8', errors='ignore') as lf:
                    license_text = lf.read()
            
            licenses.append({
                'name': name,
                'version': version,
                'license': license_id,
                'license_url': license_url,
                'license_text': license_text,
            })
    
    return licenses

def generate_html():
    """Generate HTML from template"""
    print("Generating licenses HTML page...")
    
    # Load licenses
    licenses = load_licenses()
    
    # Count licenses
    license_counts = {}
    for lic in licenses:
        license_id = lic['license']
        license_counts[license_id] = license_counts.get(license_id, 0) + 1
    
    # Sort by count
    sorted_license_counts = sorted(
        license_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )
    
    # Find and setup template
    template_file = find_template()
    template_dir = template_file.parent
    env = Environment(loader=FileSystemLoader(template_dir))
    template = env.get_template(template_file.name)
    
    # Render template
    html = template.render(
        licenses=licenses,
        license_counts=sorted_license_counts,
        total_count=len(licenses),
    )
    
    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"✓ Generated licenses page: {OUTPUT_FILE}")
    print(f"  Total packages: {len(licenses)}")
    print(f"  Unique licenses: {len(license_counts)}")

if __name__ == '__main__':
    generate_html()
