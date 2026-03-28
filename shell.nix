{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    nodejs
    git
    lefthook
    treefmt
    nixfmt
    prettier
  ];

  shellHook = ''
    echo "🚕 Taxi Concierge Dev Environment Ready"

    # Install lefthook hooks automatically
    if [ -f lefthook.yml ]; then
      git init
      lefthook install
    fi
  '';
}
