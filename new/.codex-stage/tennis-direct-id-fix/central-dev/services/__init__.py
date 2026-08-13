"""Test overlay package; extend into the checked-out central repository."""

from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)
