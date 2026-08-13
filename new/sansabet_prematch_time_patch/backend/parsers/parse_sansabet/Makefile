include .env
export $(shell sed 's/=.*//' .env)

NAME=parse_sansabet

build_ps:  ### run parse_sansabet in local environment
	@echo "Building ${NAME} binary..."
	cd ../${NAME} && env GOOS=linux CGO_ENABLED=0 go build -o ${NAME} ./cmd
	@echo "Done!"
	./${NAME}
.PHONY: ./${NAME}