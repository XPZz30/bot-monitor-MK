import pandas as pd

try:
    df = pd.read_excel(r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\exemplo_pt-BR.xlsx')
    print("Columns in exemplo_pt-BR.xlsx:")
    print(list(df.columns))
except Exception as e:
    print(f"Error reading Excel: {e}")
