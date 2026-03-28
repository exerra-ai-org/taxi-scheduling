{
  description = "Taxi Concierge System Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        # Load the devShell configuration from shell.nix
        devShells.default = import ./shell.nix { inherit pkgs; };

        # We can also expose the formatter if needed
        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
