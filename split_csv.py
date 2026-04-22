import os

def split_csv(input_file, part1_file, part2_file, max_lines=20000):
    with open(input_file, 'r', encoding='utf-8') as f:
        header = f.readline()
        
        # Part 1
        with open(part1_file, 'w', encoding='utf-8') as p1:
            p1.write(header)
            for i in range(max_lines - 1):
                line = f.readline()
                if not line:
                    break
                p1.write(line)
        
        # Part 2
        with open(part2_file, 'w', encoding='utf-8') as p2:
            p2.write(header)
            while True:
                line = f.readline()
                if not line:
                    break
                p2.write(line)

if __name__ == "__main__":
    input_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\produtos_excel.csv'
    part1_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\part 1.csv'
    part2_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\part 2.csv'
    
    split_csv(input_path, part1_path, part2_path)
    print(f"Split complete. Created '{part1_path}' and '{part2_path}'.")
