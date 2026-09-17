"""
Generates real PNG benchmark screenshot datasets for visual evaluation
Saves into evaluation/datasets/visual-context/screens/
"""

import os
from dataset import RENDERERS, PAGE_CLASSES

def generate_benchmark_screens(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for cat, renderer in RENDERERS.items():
        img = renderer(img_size=256)
        path = os.path.join(out_dir, f"{cat.lower()}.png")
        img.save(path, format='PNG')
        print(f"Saved benchmark screen: {path} ({os.path.getsize(path)} bytes)")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(script_dir, '../../evaluation/datasets/visual-context/screens'))
    generate_benchmark_screens(out_dir)
