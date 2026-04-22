import zipfile
import xml.etree.ElementTree as ET

xlsx_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\exemplo_pt-BR.xlsx'

try:
    with zipfile.ZipFile(xlsx_path, 'r') as z:
        with z.open('xl/sharedStrings.xml') as f:
            tree = ET.parse(f)
            root = tree.getroot()
            strings = [node.text for node in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]
            for i, s in enumerate(strings):
                print(f"{i}: {s}")
except Exception as e:
    print(f"Error: {e}")
