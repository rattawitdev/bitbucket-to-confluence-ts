package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// UserService handles user-related operations
type UserService struct {
	db *Database
}

// User represents a user entity
type User struct {
	ID      int64        `json:"id"`
	Name    string       `json:"name"`
	Email   string       `json:"email"`
	Active  bool         `json:"active"`
	Profile *UserProfile `json:"profile,omitempty"`
}

// UserProfile contains additional user information
type UserProfile struct {
	Bio         string                 `json:"bio"`
	Avatar      string                 `json:"avatar"`
	Preferences map[string]interface{} `json:"preferences"`
}

// CreateUserRequest represents the request body for creating a user
type CreateUserRequest struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

// UpdateUserRequest represents the request body for updating a user
type UpdateUserRequest struct {
	Name   string `json:"name,omitempty"`
	Email  string `json:"email,omitempty"`
	Active *bool  `json:"active,omitempty"`
}

// GetUser retrieves a user by their ID
// This endpoint returns complete user information including profile data
// @Summary Get user by ID
// @Description Retrieve detailed user information by user identifier
// @Tags users
// @Param id path int true "User ID"
// @Success 200 {object} User
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/users/{id} [get]
func (s *UserService) GetUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := s.db.GetUserByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// CreateUser creates a new user account
// Validates the input data and creates a user with default settings
// @Summary Create new user
// @Description Create a new user account with validation
// @Tags users
// @Accept json
// @Produce json
// @Param user body CreateUserRequest true "User creation data"
// @Success 201 {object} User
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /api/v1/users [post]
func (s *UserService) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if user already exists
	exists, err := s.db.UserExists(req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": "User already exists"})
		return
	}

	user, err := s.db.CreateUser(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, user)
}

// UpdateUser updates an existing user's information
// Allows partial updates of user data
// @Summary Update user
// @Description Update user information with partial data
// @Tags users
// @Accept json
// @Produce json
// @Param id path int true "User ID"
// @Param user body UpdateUserRequest true "User update data"
// @Success 200 {object} User
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/users/{id} [put]
func (s *UserService) UpdateUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := s.db.UpdateUser(id, req)
	if err != nil {
		if err.Error() == "user not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// DeleteUser removes a user account
// Soft deletes the user and related data
// @Summary Delete user
// @Description Soft delete a user account
// @Tags users
// @Param id path int true "User ID"
// @Success 204
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Router /api/v1/users/{id} [delete]
func (s *UserService) DeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	err = s.db.SoftDeleteUser(id)
	if err != nil {
		if err.Error() == "user not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.Status(http.StatusNoContent)
}

// ListUsers retrieves a paginated list of users
// Supports filtering and sorting options
// @Summary List users
// @Description Get paginated list of users with filtering
// @Tags users
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(10)
// @Param active query bool false "Filter by active status"
// @Param search query string false "Search in name and email"
// @Success 200 {object} UserListResponse
// @Failure 400 {object} ErrorResponse
// @Router /api/v1/users [get]
func (s *UserService) ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	search := c.Query("search")
	activeFilter := c.Query("active")

	var active *bool
	if activeFilter != "" {
		activeBool, err := strconv.ParseBool(activeFilter)
		if err == nil {
			active = &activeBool
		}
	}

	filters := UserFilters{
		Page:   page,
		Limit:  limit,
		Search: search,
		Active: active,
	}

	result, err := s.db.ListUsers(filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve users"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// UserFilters contains filtering options for user list
type UserFilters struct {
	Page   int
	Limit  int
	Search string
	Active *bool
}

// UserListResponse represents paginated user list response
type UserListResponse struct {
	Users      []User `json:"users"`
	Total      int64  `json:"total"`
	Page       int    `json:"page"`
	Limit      int    `json:"limit"`
	TotalPages int    `json:"total_pages"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}
