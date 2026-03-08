#!/usr/bin/env python3
"""
Oncor Takeoff Markup Tool
Generates marked-up construction drawings with quantities
"""

import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color
import io
import os

# Color scheme for different work types
COLORS = {
    'slab': (0.2, 0.6, 0.9, 0.3),      # Blue - slabs/flatwork
    'sidewalk': (0.2, 0.8, 0.4, 0.3),   # Green - sidewalks
    'curb': (0.9, 0.5, 0.2, 0.3),       # Orange - curbs
    'footing': (0.8, 0.2, 0.2, 0.3),    # Red - footings
    'wall': (0.6, 0.3, 0.7, 0.3),       # Purple - walls
}

def create_sample_plan():
    """Create a sample floor plan PDF to demonstrate markup"""
    
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    
    # Title
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "SAMPLE SITE PLAN - ONCOR CONCRETE")
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 70, "Scale: 1\" = 20'")
    
    # Draw building outline
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(2)
    c.rect(100, 200, 400, 300)  # Main building
    
    # Interior walls
    c.setLineWidth(1)
    c.line(100, 350, 300, 350)  # Horizontal wall
    c.line(300, 200, 300, 500)  # Vertical wall
    
    # Sidewalk path
    c.setLineWidth(0.5)
    c.rect(50, 150, 500, 40)   # Front sidewalk
    c.rect(510, 150, 40, 400)  # Side sidewalk
    
    # Parking area
    c.setDash([3, 3])
    c.rect(50, 550, 450, 100)
    c.setDash([])
    
    # Labels
    c.setFont("Helvetica", 8)
    c.drawString(220, 400, "WAREHOUSE")
    c.drawString(350, 320, "OFFICE")
    c.drawString(130, 280, "LOADING")
    c.drawString(250, 165, "SIDEWALK")
    c.drawString(520, 350, "SIDE WALK")
    c.drawString(200, 600, "PARKING LOT")
    
    # Dimensions
    c.setFont("Helvetica", 7)
    c.drawString(280, 510, "80'")
    c.drawString(505, 350, "60'")
    c.drawString(280, 145, "100'")
    
    c.save()
    buffer.seek(0)
    return buffer

def add_takeoff_markup(input_pdf, takeoff_items):
    """
    Add markup annotations to a PDF based on takeoff items
    
    takeoff_items: list of dicts with:
        - name: item name
        - type: 'slab', 'sidewalk', 'curb', etc.
        - rect: (x1, y1, x2, y2) coordinates
        - quantity: calculated quantity
        - unit: 'SF', 'LF', 'CY', etc.
    """
    
    doc = fitz.open(stream=input_pdf.read(), filetype="pdf")
    page = doc[0]
    
    for item in takeoff_items:
        x1, y1, x2, y2 = item['rect']
        rect = fitz.Rect(x1, y1, x2, y2)
        
        # Get color for this item type
        r, g, b, a = COLORS.get(item['type'], (0.5, 0.5, 0.5, 0.3))
        
        # Draw filled rectangle with transparency
        shape = page.new_shape()
        shape.draw_rect(rect)
        shape.finish(
            color=(r, g, b),
            fill=(r, g, b),
            fill_opacity=a,
            width=2
        )
        shape.commit()
        
        # Add quantity label
        qty_text = f"{item['name']}\n{item['quantity']:,.0f} {item['unit']}"
        
        # Calculate center of rectangle for label
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2
        
        # Add text annotation
        text_rect = fitz.Rect(center_x - 40, center_y - 15, center_x + 40, center_y + 15)
        
        # White background for readability
        shape2 = page.new_shape()
        shape2.draw_rect(text_rect)
        shape2.finish(color=(0, 0, 0), fill=(1, 1, 1), fill_opacity=0.9, width=0.5)
        shape2.commit()
        
        # Insert text
        page.insert_textbox(
            text_rect,
            qty_text,
            fontsize=8,
            fontname="helv",
            align=fitz.TEXT_ALIGN_CENTER
        )
    
    # Add legend
    add_legend(page, takeoff_items)
    
    return doc

def add_legend(page, takeoff_items):
    """Add a legend/summary box to the page"""
    
    # Position in bottom right
    legend_x = 400
    legend_y = 50
    legend_width = 180
    legend_height = 30 + (len(takeoff_items) * 18)
    
    # Draw legend box
    legend_rect = fitz.Rect(legend_x, legend_y, legend_x + legend_width, legend_y + legend_height)
    
    shape = page.new_shape()
    shape.draw_rect(legend_rect)
    shape.finish(color=(0, 0, 0), fill=(1, 1, 1), fill_opacity=0.95, width=1)
    shape.commit()
    
    # Title
    title_rect = fitz.Rect(legend_x + 5, legend_y + 5, legend_x + legend_width - 5, legend_y + 20)
    page.insert_textbox(title_rect, "QUANTITY TAKEOFF", fontsize=10, fontname="helv", align=fitz.TEXT_ALIGN_CENTER)
    
    # Items
    y_offset = 25
    for item in takeoff_items:
        r, g, b, _ = COLORS.get(item['type'], (0.5, 0.5, 0.5, 0.3))
        
        # Color swatch
        swatch_rect = fitz.Rect(legend_x + 8, legend_y + y_offset, legend_x + 18, legend_y + y_offset + 10)
        shape = page.new_shape()
        shape.draw_rect(swatch_rect)
        shape.finish(color=(0, 0, 0), fill=(r, g, b), width=0.5)
        shape.commit()
        
        # Item text
        text_rect = fitz.Rect(legend_x + 22, legend_y + y_offset - 2, legend_x + legend_width - 5, legend_y + y_offset + 12)
        item_text = f"{item['name']}: {item['quantity']:,.0f} {item['unit']}"
        page.insert_textbox(text_rect, item_text, fontsize=8, fontname="helv")
        
        y_offset += 18
    
    # Total line
    total_cy = sum(item.get('cubic_yards', 0) for item in takeoff_items)
    if total_cy > 0:
        y_offset += 5
        total_rect = fitz.Rect(legend_x + 5, legend_y + y_offset, legend_x + legend_width - 5, legend_y + y_offset + 15)
        page.insert_textbox(total_rect, f"TOTAL: {total_cy:,.1f} CY", fontsize=9, fontname="helv", align=fitz.TEXT_ALIGN_CENTER)

def main():
    """Demo: create sample plan and add markup"""
    
    print("Oncor Takeoff Markup Tool")
    print("=" * 40)
    
    # Create sample plan
    print("Creating sample site plan...")
    sample_pdf = create_sample_plan()
    
    # Define takeoff items (simulating what would come from actual measurements)
    takeoff_items = [
        {
            'name': 'Warehouse Slab',
            'type': 'slab',
            'rect': (100, 292, 300, 500),  # fitz uses top-left origin
            'quantity': 4800,
            'unit': 'SF',
            'cubic_yards': 29.6  # 4" thick
        },
        {
            'name': 'Office Slab',
            'type': 'slab', 
            'rect': (300, 292, 500, 442),
            'quantity': 3000,
            'unit': 'SF',
            'cubic_yards': 18.5
        },
        {
            'name': 'Loading Slab',
            'type': 'slab',
            'rect': (100, 442, 300, 592),
            'quantity': 3000,
            'unit': 'SF',
            'cubic_yards': 22.2  # 6" thick for loading
        },
        {
            'name': 'Front Sidewalk',
            'type': 'sidewalk',
            'rect': (50, 602, 550, 642),
            'quantity': 500,
            'unit': 'SF',
            'cubic_yards': 3.1
        },
        {
            'name': 'Side Sidewalk',
            'type': 'sidewalk',
            'rect': (510, 242, 550, 602),
            'quantity': 360,
            'unit': 'SF',
            'cubic_yards': 2.2
        },
    ]
    
    print(f"Adding markup for {len(takeoff_items)} items...")
    
    # Add markup
    marked_doc = add_takeoff_markup(sample_pdf, takeoff_items)
    
    # Save output
    output_path = "/home/ubuntu/clawd/oncor/takeoff-tool/sample_takeoff_marked.pdf"
    marked_doc.save(output_path)
    marked_doc.close()
    
    print(f"\n✓ Marked-up PDF saved to: {output_path}")
    print("\nQuantity Summary:")
    print("-" * 40)
    
    total_sf = 0
    total_cy = 0
    for item in takeoff_items:
        print(f"  {item['name']}: {item['quantity']:,} {item['unit']} ({item['cubic_yards']:.1f} CY)")
        total_sf += item['quantity']
        total_cy += item['cubic_yards']
    
    print("-" * 40)
    print(f"  TOTAL: {total_sf:,} SF / {total_cy:.1f} CY")
    
    return output_path

if __name__ == "__main__":
    main()
